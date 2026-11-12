import { readVisiblePageState } from './visible-state/read-visible-page-state.mjs';
import { isNoSurveyFrame } from '../autofill/adsmith/is-no-survey-frame.mjs';
import { inspectAiStateGate, blockAiForState } from './retry/ai-state-gate.mjs';
import { AI_PROGRESS_CHECK_INTERVAL_MS } from './state/ai-progress-check-interval-ms.mjs';
import { AI_STALLED_ROUND_LIMIT } from './state/ai-stalled-round-limit.mjs';
import { MAX_ROUNDS } from './state/max-rounds.mjs';
import { callAgt } from './call-agt.mjs';
import { detectSmartFallbackAction } from './detect-smart-fallback-action.mjs';
import { executeAction } from './execute-action.mjs';
import { globalAiConfig } from './state/global-ai-config.mjs';
import { moduleState } from './state/module-state.mjs';
import { parseActions } from './parse-actions.mjs';
import { resolveAiTimeoutSeconds } from './resolve-ai-timeout-seconds.mjs';
import { waitForFormProgress } from './wait-for-form-progress.mjs';
import { waitForAiCapacity } from './wait-for-ai-capacity.mjs';

/**
 * Chạy vòng lặp AI assist: gọi agy/codex, thực thi actions, lặp đến khi hoàn tất hoặc không còn form.
 *
 * @param {object} page Playwright page đang kẹt.
 * @param {object} record Bản ghi autofill đang dùng cho phiên này.
 * @param {object} [session={}] Session object để log và cập nhật số trường.
 * @param {object} [options={}] Tùy chọn bổ sung (onLog callback, v.v.).
 * @return {Promise<void>}
 * @throws {Error} Nếu thao tác Playwright ngoài các nhánh fallback phát sinh lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function runAiAssist(page, record, session = {}, options = {}) {
  if (['manual','skip','consent_only'].includes(session.offerMode) && !options.forceRetry) return;
  const cfg = {
    ...globalAiConfig,
    ...(options.aiConfig || {})
  };
  if (!cfg.enabled || cfg.mode === 'disabled') {
    const slotNum = (session.tileIndex ?? 0) + 1;
    console.log(`[AI-Assist] Slot ${slotNum}: AI Assist đang tắt theo cấu hình.`);
    return;
  }
  if (!session.aiRunningPages) session.aiRunningPages = new Set();
  if (session.aiRunningPages.has(page) || page._aiAssistRunning || page._aiFormFixing) return; // tab này đang chạy AI rồi
  session.aiRunningPages.add(page);
  page._aiAssistRunning = true;
  session.aiAssistRunning = session.aiRunningPages.size > 0;
  const slotNum = (session.tileIndex ?? 0) + 1;
  const tabNum = page._tabIndex !== undefined ? page._tabIndex + 1 : 1;
  const ip = session.exitIp ?? 'chưa rõ';
  const currentUrl = page.url?.() || '';
  if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.startsWith('chrome-error:') || currentUrl.includes('api.ipify.org') || currentUrl.includes('toffers.top/click')) {
    console.log(`[AI-Assist] Slot ${slotNum} Tab ${tabNum}: URL chưa phải trang form (${currentUrl}), bỏ qua AI.`);
    session.aiRunningPages.delete(page);
    page._aiAssistRunning = false;
    session.aiAssistRunning = session.aiRunningPages.size > 0;
    return;
  }
  console.log(`[AI-Assist] Slot ${slotNum} Tab ${tabNum} [IP: ${ip}]: bắt đầu hỗ trợ AI cho trang ${currentUrl} (Chế độ: ${cfg.mode})`);
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
  let totalActionsExecuted = 0;
  let stagnantRounds = 0;
  let lastAttemptSignature = '';
  let waitingForPage = false;
  let waitingReason = 'Chờ giao diện thay đổi';
  const maxRounds = cfg.maxRounds || MAX_ROUNDS;
  try {
    if (await isNoSurveyFrame(page._activeAutofillFrame)) return;
    for (let round = 1; round <= maxRounds; round++) {
      if (page.isClosed() || session.isClosed) break;

      const visibleState = await readVisiblePageState(page);
      const decision = inspectAiStateGate(page, visibleState, round === 1 && options.forceRetry === true);
      if (!decision.allowed) {
        waitingForPage = true;
        waitingReason = decision.detail;
        if (decision.shouldLog) addLog({ type: 'ai_waiting_state', detail: `[AI Assist] Chờ giao diện thay đổi; ${decision.detail}.` });
        break;
      }
      updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#a78bfa;font-weight:600;">🤖 AI Assist đang phân tích (vòng ${round}/${maxRounds})...</span>`);
      addLog({
        time: new Date().toISOString(),
        type: 'ai_started',
        url: page.url(),
        detail: `[AI Assist] Đang phân tích trang ${page.url()} (vòng ${round}/${maxRounds})...`
      });

      const cleanedHtml = visibleState.html;
      const formStateBeforeAi = visibleState.signature;
      lastAttemptSignature = visibleState.signature;
      const recordJson = JSON.stringify(record ?? {}, null, 2);
      let prompt = `BỎ QUA SUY NGHĨ (NO REASONING/THINKING). KHÔNG GIẢI THÍCH. ƯU TIÊN TỐC ĐỘ TỐI ĐA.
Chỉ dùng selector được cung cấp cho các control hiển thị và chưa bị khóa. Không đề xuất click/gõ trên bước ẩn. Nếu chưa có thao tác hợp lệ, trả [].
Sinh mảng JSON thao tác UI để hoàn thành hoặc tiếp tục trang web dưới đây:
URL: ${page.url()}
Dữ liệu người dùng cung cấp:
${recordJson}

QUY TẮC SIÊU TỐC:
- KHÔNG CẦN CHỌN ĐÚNG, CHỌN NHANH: Câu hỏi khảo sát / ý kiến / trắc nghiệm -> Chọn ngay đáp án "Yes" hoặc lựa chọn đầu tiên hợp lệ.
- Trường nhập liệu (tên, họ, email, phone, ngày sinh, địa chỉ, zip): Điền nhanh theo dữ liệu người dùng ở trên.
- Không submit/Continue/Next/CTA điều hướng. Chỉ sửa field bằng record và chọn đáp án; pipeline autofill phụ trách kiểm tra và submit.
- Chú ý cấu trúc Offer/Landing Page: Các ô nhập và nút bấm thường nằm trong thẻ <div> class "input", "button", "btn-option" (không bắt buộc nằm trong thẻ <form>).

YÊU CẦU ĐẦU RA BẮT BUỘC:
- Trả về DUY NHẤT 1 mảng JSON, bắt đầu bằng [ và kết thúc bằng ]. Tuyệt đối KHÔNG viết bất kỳ chữ nào khác ngoài JSON.
Format các action:
[
  {"action":"fill","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"},
  {"action":"select","selector":"CSS_SELECTOR","value":"GIÁ_TRỊ"},
  {"action":"check","selector":"CSS_SELECTOR"},
  {"action":"click","selector":"CSS_SELECTOR"}
]`;
      if (cfg.customInstructions && typeof cfg.customInstructions === 'string' && cfg.customInstructions.trim()) {
        prompt += `\n\nHƯỚNG DẪN BỔ SUNG CỦA NGƯỜI DÙNG:\n${cfg.customInstructions.trim()}`;
      }
      prompt += `\n\nHTML GIAO DIỆN:\n${cleanedHtml}`;
      let actions = [];
      let t0 = Date.now();
      if (cfg.mode === 'heuristic_only') {
        console.log(`[AI-Assist] Slot ${slotNum} round ${round}: Chế độ Heuristic Fallback Only, bỏ qua gọi CLI.`);
      } else if (session.isClosed) {
        break;
      } else {
        // Tối đa MAX_CONCURRENT_AGT tiến trình AI chạy cùng lúc; slot khác xếp hàng. Ghi log khi phải chờ
        // để giao diện không trông như AI bị treo, và chỉ tính thời gian phản hồi từ lúc thật sự gọi AI.
        const queuedAt = Date.now();
        const capacity = await waitForAiCapacity(page, session, formStateBeforeAi, 15000, state => {
          updateBadge(`🤖 Chờ lượt AI: ${state.position}${state.priority ? ' · Ưu tiên IP có lead' : ''}`);
          addLog({ type: 'ai_queued', detail: `Chờ chỗ AI ${state.running}/${state.limit}; vị trí ${state.position}${state.priority ? ', ưu tiên IP đã có lead' : ''}.` });
        });
        if (capacity !== 'acquired') {
          waitingForPage = true;
          waitingReason = capacity === 'queue_timeout' ? 'Hết lượt chờ AI; autofill đang được nhả khóa để thử tiếp' : 'Trang đã đổi/đóng; hủy lượt AI của trạng thái cũ';
          addLog({ type: capacity === 'queue_timeout' ? 'ai_queue_timeout' : 'ai_queue_cancelled', detail: capacity === 'queue_timeout' ? 'Hết 15 giây xếp hàng AI; trả quyền về autofill để tab không bị khóa chờ.' : 'Trang đổi hoặc đóng khi đợi AI; hủy phân tích trạng thái cũ và trả quyền về autofill.' });
          break;
        }
        if (page.isClosed() || session.isClosed) {
          moduleState.agtRunningCount = Math.max(0, moduleState.agtRunningCount - 1);
          break;
        }
        const queuedSeconds = ((Date.now() - queuedAt) / 1000).toFixed(1);
        if (Number(queuedSeconds) >= 1) console.log(`[AI-Assist] Slot ${slotNum} round ${round}: chờ lượt AI ${queuedSeconds}s.`);
        t0 = Date.now();
        addLog({
          time: new Date().toISOString(),
          type: 'ai_waiting_codex',
          detail: `[AI Assist] ⏳ Đang chờ AI phản hồi (vòng ${round}/${maxRounds})… URL: ${page.url()}`
        });
        try {
          const raw = await callAgt(prompt, {
            cliBinary: cfg.cliBinary,
            timeoutSeconds: resolveAiTimeoutSeconds(cfg.timeoutSeconds)
          });
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          actions = parseActions(raw);
          console.log(`[AI-Assist] Slot ${slotNum} round ${round}: AI trả ${actions.length} action(s) (${elapsed}s)`);
          addLog({
            time: new Date().toISOString(),
            type: 'ai_codex_reply',
            detail: `[AI Assist] ✅ AI phản hồi sau ${elapsed}s — ${actions.length} action(s)`
          });
        } catch (err) {
          const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
          console.warn(`[AI-Assist] Slot ${slotNum} round ${round}: cảnh báo AI sau ${elapsed}s — ${err.message}`);
          addLog({
            time: new Date().toISOString(),
            type: 'ai_error',
            detail: `[AI Assist] ❌ Lỗi gọi AI sau ${elapsed}s: ${err.message}`
          });
        } finally {
          moduleState.agtRunningCount = Math.max(0, moduleState.agtRunningCount - 1);
        }
      }
      if (actions.length === 0) {
        // Fallback tự động thông minh: nếu AI trả về [] nhưng trang thực tế có câu hỏi trắc nghiệm, survey, nút Jump Page, hoặc Submit
        const smartFallback = await detectSmartFallbackAction(page, cfg);
        if (smartFallback) {
          actions = [{
            action: smartFallback.action,
            selector: smartFallback.selector
          }];
          console.log(`[AI-Assist] Slot ${slotNum}: kích hoạt fallback: ${smartFallback.detail}`);
          addLog({
            time: new Date().toISOString(),
            type: 'ai_smart_fallback',
            detail: `[AI Assist] 🛡️ Fallback: ${smartFallback.detail}`
          });
        } else {
          const stillHasWork = (await readVisiblePageState(page)).hasWork;
          if (stillHasWork) {
            console.log(`[AI-Assist] Slot ${slotNum}: AI chưa đề xuất action; sẽ kiểm tra lại sau ${AI_PROGRESS_CHECK_INTERVAL_MS / 1000}s.`);
            addLog({
              time: new Date().toISOString(),
              type: 'ai_no_actions',
              detail: `[AI Assist] AI chưa đề xuất action nhưng form còn việc; watchdog sẽ kiểm tra lại sau ${AI_PROGRESS_CHECK_INTERVAL_MS / 1000}s.`
            });
          } else {
            console.log(`[AI-Assist] Slot ${slotNum}: không còn việc cần làm ([] trả về).`);
            addLog({
              time: new Date().toISOString(),
              type: 'ai_no_actions',
              detail: `[AI Assist] Không còn form/câu hỏi cần xử lý.`
            });
            break;
          }
        }
      }
      for (const act of actions) {
        if (page.isClosed() || session.isClosed) break;
        try {
          updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:#818cf8;font-weight:600;">🤖 AI: ${act.action} ${act.selector || ''}</span>`);
          const actionResult = await executeAction(page, act, session, { allowSubmit: false, providedValuesOnly: true, record, onLog: addLog });
          if (!actionResult.ok) {
            addLog({
              time: new Date().toISOString(),
              type: 'ai_action_failed',
              detail: `[AI Assist] Không thực hiện được ${act.action} trên ${act.selector || '(thiếu selector)'}: ${actionResult.reason}.`
            });
            if (actionResult.reason === 'scope_unavailable') {
              stagnantRounds = 0;
              waitingForPage = true;
              waitingReason = 'Phạm vi form tạm thời chưa khả dụng; trả quyền cho autofill xác định lại';
              addLog({ type: 'ai_scope_waiting', detail: waitingReason });
              return;
            }
            continue;
          }
          totalActionsExecuted += 1;
          addLog({
            time: new Date().toISOString(),
            type: actionResult.verified ? 'ai_action' : 'ai_action_dispatched',
            detail: actionResult.verified ? `[AI Assist] Đã xác minh ${act.action} trên selector: ${act.selector} ${act.value ? `("${act.value}")` : ''}` : `[AI Assist] Đã gửi thao tác ${act.action} tới selector: ${act.selector}; đang chờ giao diện xác nhận chuyển bước.`
          });
          await new Promise(r => setTimeout(r, 300));
        } catch (actErr) {
          console.warn(`[AI-Assist] Action lỗi: ${act.action} ${act.selector}: ${actErr.message}`);
        }
      }

      // Sync: kích autofill quét lại ngay sau khi AI thực thi xong actions
      if (cfg.syncAutofill !== false) {
        session.triggerAutofillScan?.();
        addLog({
          time: new Date().toISOString(),
          type: 'ai_sync_scan',
          detail: `[AI Assist] 🔄 Sync: kích autofill quét lại sau ${actions.length} action(s) của AI.`
        });
      }

      // Nếu form vẫn đứng yên sau 5 giây, vòng kế tiếp sẽ gửi lại trạng thái mới cho AI.
      const formChanged = await waitForFormProgress(page, formStateBeforeAi);
      if (formChanged) {
        stagnantRounds = 0;
        addLog({
          time: new Date().toISOString(),
          type: 'ai_form_progress',
          detail: `[AI Assist] Form đã thay đổi sau vòng ${round}; tiếp tục kiểm tra trạng thái mới.`
        });
      } else {
        stagnantRounds++;
        addLog({
          time: new Date().toISOString(),
          type: 'ai_watchdog_retry',
          detail: `[AI Assist] Form không đổi sau ${AI_PROGRESS_CHECK_INTERVAL_MS / 1000}s; sẽ gọi lại AI (${stagnantRounds}/${AI_STALLED_ROUND_LIMIT}).`
        });
        if (stagnantRounds >= AI_STALLED_ROUND_LIMIT) {
          const stalledState = await readVisiblePageState(page);
          if (stalledState.available) blockAiForState(page, stalledState.signature);
          waitingForPage = true;
          try {
            session.triggerAutofillScan?.();
          } catch {}
          addLog({
            time: new Date().toISOString(),
            type: 'ai_watchdog_fallback',
            detail: `[AI Assist] Form vẫn không đổi sau ${stagnantRounds} lần; đã kích hoạt Autofill fallback và dừng vòng lặp để tránh treo.`
          });
          break;
        }
      }
    }
  } finally {
    if (stagnantRounds > 0) {
      const finalState = await readVisiblePageState(page);
      if (finalState.available && finalState.signature === lastAttemptSignature) blockAiForState(page, finalState.signature);
      waitingForPage = true;
    }
    session.aiRunningPages?.delete(page);
    page._aiAssistRunning = false;
    session.aiAssistRunning = (session.aiRunningPages?.size ?? 0) > 0;
    if ((waitingForPage || totalActionsExecuted > 0) && !page.isClosed()) session.triggerAutofillScan?.();
    session.aiCallCount = 0;
    updateBadge(`🌐 <strong>IP:</strong> ${ip} | <span style="color:${waitingForPage ? '#f59e0b' : '#22c55e'};font-weight:600;">${waitingForPage ? `🤖 ${waitingReason}` : '🤖 AI đã kết thúc lượt kiểm tra'}</span>`);
    if (totalActionsExecuted > 0) {
      addLog({
        time: new Date().toISOString(),
        type: 'ai_completed',
        detail: `[AI Assist - Slot ${slotNum} Tab ${tabNum}] Kết thúc lượt hỗ trợ (${totalActionsExecuted} hành động đã thực hiện); trả quyền cho autofill, chưa kết luận hoàn tất offer.`
      });
    }
    console.log(`[AI-Assist] Slot ${slotNum} Tab ${tabNum}: kết thúc hỗ trợ AI (${totalActionsExecuted} actions).`);
  }
}
export { runAiAssist };
