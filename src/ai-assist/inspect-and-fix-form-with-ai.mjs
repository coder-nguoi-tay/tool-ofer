import { waitForAiCapacity } from './wait-for-ai-capacity.mjs';
import { shouldStopAfterLead } from '../autofill/should-stop-after-lead.mjs';
import { buildRepairActions } from './repair/build-repair-actions.mjs';
import { readVisiblePageState } from './visible-state/read-visible-page-state.mjs';
import { buildFirstPrompt } from '../continuous-agent/build-turn-prompt.mjs';
import { AI_REQUEST_TIMEOUT_SECONDS } from './state/ai-request-timeout-seconds.mjs';
import { MAX_FORM_REPAIR_ATTEMPTS } from './state/max-form-repair-attempts.mjs';
import { callAgt } from './call-agt.mjs';
import { createHash } from 'node:crypto';
import { executeAction } from './execute-action.mjs';
import { getFormProgressSignature } from './get-form-progress-signature.mjs';
import { globalAiConfig } from './state/global-ai-config.mjs';
import { inspectFormRepairState } from './inspect-form-repair-state.mjs';
import { moduleState } from './state/module-state.mjs';
import { parseActions } from './parse-actions.mjs';
import { resolveAiTimeoutSeconds } from './resolve-ai-timeout-seconds.mjs';

/**
 * Chẩn đoán lý do form chưa qua được (bị chặn, validation error, thiếu email)
 * bằng AI CLI (`agy`/`codex`) và tự động thực thi các hành động sửa lỗi trên form.
 *
 * @param {object} page Playwright page đang thao tác.
 * @param {object} record Bản ghi autofill của session.
 * @param {object} [session={}] Phiên session.
 * @param {object} [options={}] Tùy chọn mở rộng.
 * @return {Promise<{status: string, fixed: boolean, errors: string[], actionsCount: number}>} Trạng thái sửa form đã được xác minh hoặc lý do chưa sửa được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function inspectAndFixFormWithAi(page, record, session = {}, options = {}) {
  if (shouldStopAfterLead(session)) return { status: 'lead_confirmed_paused', fixed: false, errors: [], actionsCount: 0 };
  if (!page || typeof page.isClosed === 'function' && page.isClosed()) {
    return {
      status: 'closed',
      fixed: false,
      errors: [],
      actionsCount: 0
    };
  }
  if (['manual','skip','consent_only'].includes(session.offerMode) && !options.forceRetry) return { status:'mode_disabled',fixed:false,errors:[],actionsCount:0 };
  const cfg = {
    ...globalAiConfig,
    ...(options.aiConfig || {})
  };
  if (!cfg.enabled || ['disabled', 'form_agent'].includes(cfg.mode)) {
    return {
      status: 'disabled',
      fixed: false,
      errors: [],
      actionsCount: 0
    };
  }
  if (page._aiFormFixing || page._aiAssistRunning || page._continuousAgent) {
    return {
      status: 'in_progress',
      fixed: false,
      errors: [],
      actionsCount: 0
    };
  }
  const currentUrl = typeof page.url === 'function' ? page.url() : page.url || '';
  if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.startsWith('chrome-error:') || currentUrl.includes('api.ipify.org') || currentUrl.includes('toffers.top/click')) {
    return {
      status: 'invalid_url',
      fixed: false,
      errors: [],
      actionsCount: 0
    };
  }
  page._aiFormFixing = true;
  if (!session.aiFixingPages) session.aiFixingPages = new Set();
  session.aiFixingPages.add(page);
  session.aiFormFixing = session.aiFixingPages.size > 0;
  const slotNum = (session.tileIndex ?? 0) + 1;
  const tabNum = page._tabIndex !== undefined ? page._tabIndex + 1 : 1;
  const ip = session.exitIp ?? 'chưa rõ';
  const updateBadge = text => {
    try {
      if (typeof session.updateBadge === 'function') {
        session.updateBadge(text);
      }
    } catch {}
  };
  const addLog = entry => {
    try {
      if (typeof options.onLog === 'function') {
        options.onLog(entry);
      } else if (typeof session.addLog === 'function') {
        session.addLog(entry);
      }
    } catch {}
  };
  let capacityAcquired = false;
  try {
    // AutoFill đã chạy trước khi tới đây; chỉ kiểm tra lại trạng thái sau lượt điền thư viện.
    const assignedRecordAtInspection = page._assignedRecord;
    record = assignedRecordAtInspection || record;
    const visibleState = await readVisiblePageState(page);
    const diag = await inspectFormRepairState(page);
    if (!diag) {
      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#f59e0b;font-weight:600;">🤖 Không đọc được form</span>`);
      addLog({
        time: new Date().toISOString(),
        type: 'ai_form_inspection_failed',
        detail: '[AI Form Fix] Không đọc được trạng thái form trong 4 giây; dừng lượt này để tránh chờ vô hạn.'
      });
      return {
        status: 'inspection_failed',
        fixed: false,
        errors: [],
        actionsCount: 0
      };
    }
    if (!diag.hasBlocker) {
      page._aiFormRepairRetry = null;
      return {
        status: 'clean',
        fixed: false,
        errors: [],
        actionsCount: 0
      };
    }
    const retrySignature = createHash('sha256').update(JSON.stringify({
      url: currentUrl,
      visibleSignature: visibleState.available ? visibleState.signature : null,
      errors: diag.errors,
      blockers: diag.problemInputs.filter(input => input.required || input.isInvalid).map(({
        selector,
        type,
        required,
        isInvalid
      }) => ({
        selector,
        type,
        required,
        isInvalid
      })),
      emailMissing: diag.emailMissing
    })).digest('hex');
    const previousRetry = page._aiFormRepairRetry?.assignedRecord === assignedRecordAtInspection ? page._aiFormRepairRetry : null;
    if (previousRetry?.signature === retrySignature && previousRetry.attempts >= MAX_FORM_REPAIR_ATTEMPTS) {
      if (!previousRetry.limitLogged) {
        addLog({
          time: new Date().toISOString(),
          type: 'ai_form_retry_limit',
          detail: `[AI Form Fix] Dừng sau ${MAX_FORM_REPAIR_ATTEMPTS} lần vì cùng lỗi vẫn còn trên form.`
        });
        previousRetry.limitLogged = true;
      }
      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#f59e0b;font-weight:600;">🤖 Dừng sửa form sau ${MAX_FORM_REPAIR_ATTEMPTS} lần</span>`);
      return {
        status: 'retry_limit',
        fixed: false,
        errors: diag.errors,
        actionsCount: 0
      };
    }
    const retryAttempts = previousRetry?.signature === retrySignature ? previousRetry.attempts + 1 : 1;

    const errorSummary = diag.errors.join('; ') || (diag.emailMissing ? 'Thiếu email / email không hợp lệ' : 'Trường bắt buộc chưa điền');
    console.log(`[AI-FormDiagnose] Slot ${slotNum} [IP: ${ip}]: Phát hiện form chưa qua được do lỗi: ${errorSummary}. Đang hỏi AI và tự sửa...`);
    updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#f43f5e;font-weight:600;">🤖 AI đang sửa lỗi: ${errorSummary.slice(0, 30)}...</span>`);
    addLog({
      time: new Date().toISOString(),
      type: 'ai_form_diagnosing',
      detail: `[AI Form Fix] Form chưa qua được (${errorSummary}). Đang gửi chẩn đoán cho AI...`
    });
    const safeRepair = buildRepairActions(diag, record || {}, session, addLog);
    let actions = safeRepair.actions;
    const candidateEmail = session.assignedEmail || record?.assignedEmail || record?.email || record?.emailaddress || record?.mail || null;

    const fields = actions.filter(item => item.action === 'fill' || item.action === 'select').map(({ action, selector }) => {
      const field = diag.problemInputs.find(item => item.selector === selector) || diag.emailInput;
      return { action, selector, label: field?.label || field?.placeholder || field?.name || field?.id };
    });
    if (fields.length && cfg.mode !== 'heuristic_only') {
      const capacity = await waitForAiCapacity(page, session, visibleState.signature, 15000, state => {
        updateBadge(`🤖 Chờ lượt sửa form: ${state.position}${state.priority ? ' · Ưu tiên IP có lead' : ''}`);
        addLog({ type: 'ai_queued', detail: `Chờ chỗ AI sửa form ${state.running}/${state.limit}; vị trí ${state.position}${state.priority ? ', ưu tiên IP đã có lead' : ''}.` });
      });
      if (capacity !== 'acquired') {
        updateBadge(capacity === 'queue_timeout' ? '🤖 Hết lượt chờ AI; autofill tiếp tục' : '🤖 Trang đã đổi; hủy chẩn đoán cũ');
        addLog({ type: capacity === 'queue_timeout' ? 'ai_queue_timeout' : 'ai_queue_cancelled', detail: capacity === 'queue_timeout' ? 'Hết 15 giây chờ lượt AI; nhả khóa để autofill tiếp tục.' : 'Trang đã đổi/đóng khi chờ AI; hủy chẩn đoán cũ.' });
        return { status: capacity, fixed: false, errors: diag.errors, actionsCount: 0 };
      }
      capacityAcquired = true;
    }
    page._aiFormRepairRetry = { signature: retrySignature, attempts: retryAttempts, assignedRecord: assignedRecordAtInspection };

    if (capacityAcquired && !page.isClosed()) {
      try {
        const preferCodex = session.isAdsPower && session.browserWebSocketUrl && cfg.useCodexMcp === true;
        const raw = await callAgt(buildFirstPrompt({ html: JSON.stringify(fields) }), {
          cliBinary: preferCodex ? 'codex' : cfg.cliBinary,
          timeoutSeconds: resolveAiTimeoutSeconds(cfg.timeoutSeconds || AI_REQUEST_TIMEOUT_SECONDS)
        });
        const prioritized = new Set();
        for (const suggestion of parseActions(raw)) {
          const planned = actions.find(item => item.action !== 'check' && item.action === suggestion.action && item.selector === suggestion.selector);
          if (planned) prioritized.add(planned);
        }
        actions = [...new Set([...prioritized, ...actions])];
        addLog({ type: 'ai_form_plan_received', detail: `AI xác định ${prioritized.size}/${fields.length} trường trong danh sách sửa của app.` });
      } catch (err) {
        console.warn(`[AI-FormDiagnose] Slot ${slotNum}: AI không phản hồi (${err.message}). Dùng các trường app đã xác định.`);
      }
    }
    if (capacityAcquired) {
      moduleState.agtRunningCount = Math.max(0, moduleState.agtRunningCount - 1);
      capacityAcquired = false;
    }

    const beforeRepairState = await getFormProgressSignature(page);
    let actionsCount = 0;
    let actionsDispatchedCount = 0;
    for (const act of actions) {
      if (page._assignedRecord !== assignedRecordAtInspection) {
        return { status: 'record_changed', fixed: false, errors: diag.errors, actionsCount };
      }
      if (!globalAiConfig.enabled || ['disabled', 'form_agent'].includes(globalAiConfig.mode) || shouldStopAfterLead(session)) break;
      if (page.isClosed() || session.isClosed) break;
      try {
        const actionResult = await executeAction(page, act, session, { repairOnly: true, allowSubmit: false, record });
        if (!actionResult.ok) {
          addLog({
            time: new Date().toISOString(),
            type: ['missing_record','select_value_unmatched'].includes(actionResult.reason) ? actionResult.reason : 'ai_form_action_failed',
            detail: `[AI Form Fix] Không thực hiện được ${act.action} trên ${act.selector || '(thiếu selector)'}: ${actionResult.reason}.`
          });
          continue;
        }
        if (actionResult.verified) {
          actionsCount += 1;
        } else {
          actionsDispatchedCount += 1;
        }
        addLog({
          time: new Date().toISOString(),
          type: actionResult.verified ? 'ai_form_action_verified' : 'ai_form_action_dispatched',
          detail: actionResult.verified ? `[AI Form Fix] Đã xác minh ${act.action} trên ${act.selector}.` : `[AI Form Fix] Đã gửi thao tác ${act.action} tới ${act.selector}; chưa xác nhận form chuyển bước.`
        });
        await new Promise(resolve => setTimeout(resolve, 250));
      } catch (e) {
        console.warn(`[AI-FormDiagnose] Action lỗi: ${act.action} ${act.selector}: ${e.message}`);
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
    const afterRepairDiag = await inspectFormRepairState(page);
    const afterRepairState = await getFormProgressSignature(page);
    const pageAdvanced = (typeof page.url === 'function' ? page.url() : page.url) !== currentUrl;
    const formProgressed = Boolean(afterRepairState && afterRepairState !== beforeRepairState);
    const blockersCleared = Boolean(afterRepairDiag && !afterRepairDiag.hasBlocker);

    if (page._assignedRecord !== assignedRecordAtInspection) {
      return { status: 'record_changed', fixed: false, errors: diag.errors, actionsCount };
    }
    // Cập nhật email chỉ khi DOM xác nhận giá trị hợp lệ sau lượt sửa.
    if (candidateEmail && afterRepairDiag?.emailInput && !afterRepairDiag.emailMissing) {
      session.emailFilled = true;
      session.screenHasEmail = true;
      if (!session.assignedEmail) session.assignedEmail = candidateEmail;
    }
    if (blockersCleared || pageAdvanced) {
      page._aiFormRepairRetry = null;
      console.log(`[AI-FormDiagnose] Slot ${slotNum}: Xác minh form đã hết lỗi hoặc đã chuyển sang màn tiếp theo.`);
      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#10b981;font-weight:600;">🤖 Đã xác minh form tiếp tục</span>`);
      session.triggerAutofillScan?.();
      return {
        status: pageAdvanced ? 'progressed' : 'healed',
        fixed: true,
        errors: diag.errors,
        actionsCount
      };
    }
    if (actionsCount > 0 || actionsDispatchedCount > 0 || formProgressed) {
      addLog({
        time: new Date().toISOString(),
        type: 'ai_form_repair_unverified',
        detail: `[AI Form Fix] Có ${actionsCount} thao tác đã xác minh và ${actionsDispatchedCount} thao tác đã gửi, nhưng form vẫn còn lỗi; chưa ghi nhận đã sửa.`
      });
      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#f59e0b;font-weight:600;">🤖 Form còn lỗi sau khi sửa</span>`);
      session.triggerAutofillScan?.();
      return {
        status: safeRepair.missing.length ? 'missing_record' : 'unverified',
        fixed: false,
        errors: afterRepairDiag?.errors || diag.errors,
        actionsCount
      };
    }
    return {
      status: safeRepair.missing.length ? 'missing_record' : 'no_actions',
      fixed: false,
      errors: afterRepairDiag?.errors || diag.errors,
      actionsCount: 0
    };
  } catch (err) {
    console.warn(`[AI-FormDiagnose] Slot ${slotNum} Tab ${tabNum}: Lỗi quy trình chẩn đoán form: ${err.message}`);
    return {
      status: 'error',
      fixed: false,
      errors: [],
      actionsCount: 0
    };
  } finally {
    if (capacityAcquired) moduleState.agtRunningCount = Math.max(0, moduleState.agtRunningCount - 1);
    page._aiFormFixing = false;
    session.aiFixingPages?.delete(page);
    session.aiFormFixing = (session.aiFixingPages?.size ?? 0) > 0;
  }
}
export { inspectAndFixFormWithAi };
