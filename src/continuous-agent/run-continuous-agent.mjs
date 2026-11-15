import { readVisiblePageState } from '../ai-assist/visible-state/read-visible-page-state.mjs';
import { inspectAiStateGate, blockAiForState } from '../ai-assist/retry/ai-state-gate.mjs';
import { waitForAiCapacity } from '../ai-assist/wait-for-ai-capacity.mjs';
import { moduleState } from '../ai-assist/state/module-state.mjs';
import { executeAction } from '../ai-assist/execute-action.mjs';
import { parseActions } from '../ai-assist/parse-actions.mjs';
import { AI_STALLED_ROUND_LIMIT } from '../ai-assist/state/ai-stalled-round-limit.mjs';
import { shouldStopAfterLead } from '../autofill/should-stop-after-lead.mjs';
import { buildFirstPrompt, buildNextPrompt } from './build-turn-prompt.mjs';
import { sleep, waitForSignatureChange } from './wait-for-signature-change.mjs';

/** Số lượt tối đa trong một hội thoại agy; quá thì mở hội thoại mới (context mỗi lượt cộng dồn HTML). */
const MAX_TURNS_PER_CONVERSATION = 25;
const WAIT_AFTER_ACTIONS_MS = 8_000;
const WAIT_AFTER_EMPTY_MS = 15_000;
const BADGE_LABELS = { queued: 'chờ lượt AI', thinking: 'đang phân tích', acting: 'đang thao tác', waiting_page: 'chờ giao diện mới', waiting_lead: 'có lead — đã dừng', backing_off: 'lỗi tạm thời, thử lại' };

/**
 * Đổi trạng thái agent, cập nhật badge và ghi log chống lặp cùng nội dung.
 * @param {object} agent Agent của tab.
 * @param {string} status Trạng thái mới.
 * @param {string} [detail=''] Lý do hiển thị.
 * @param {boolean} [log=false] Ghi vào nhật ký tab.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
function setStatus(agent, status, detail = '', log = false) {
  if (agent.status === 'stopped') return;
  const changed = agent.status !== status;
  agent.status = status; agent.detail = detail;
  if (changed) {
    try { agent.session.updateBadge?.(`🌐 <strong>IP:</strong> ${agent.session.exitIp ?? 'chưa rõ'} | <span style="color:#a78bfa;font-weight:600;">🤖 Continuous: ${BADGE_LABELS[status] || status}</span>`); } catch {}
  }
  if (log && detail && agent.lastLog !== detail) { agent.lastLog = detail; agent.log({ time: new Date().toISOString(), type: `continuous_${status}`, detail: `[Continuous AI] ${detail}` }); }
}

/**
 * Bật/tắt cờ "AI đang giữ tab": watcher autofill hiện có đã tôn trọng cờ này nên không điền song song.
 * Phản chiếu đúng các trường mà `runAiAssist` hiện đang đặt.
 * @param {object} agent Agent của tab.
 * @param {boolean} on Giữ hay nhả quyền.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
function setOwner(agent, on) {
  const { page, session } = agent;
  if (!session.aiRunningPages) session.aiRunningPages = new Set();
  on ? session.aiRunningPages.add(page) : session.aiRunningPages.delete(page);
  page._aiAssistRunning = on;
  session.aiAssistRunning = session.aiRunningPages.size > 0;
}

/**
 * Xin một lượt AI dùng chung hàng đợi hiện có; hết 15s thì xin tiếp thay vì bỏ tab (có trạng thái `queued`).
 * @param {object} agent Agent của tab.
 * @param {string} signature Chữ ký giao diện đang xử lý.
 * @return {Promise<string>} acquired | page_changed | closed | aborted.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
async function acquireCapacity(agent, signature) {
  for (;;) {
    if (agent.signal.aborted) return 'aborted';
    const result = await waitForAiCapacity(agent.page, agent.session, signature, 15_000, state => setStatus(agent, 'queued', `Chờ lượt AI ${state.running}/${state.limit}; vị trí ${state.position}${state.priority ? ' (ưu tiên IP có lead)' : ''}`, true));
    if (result !== 'queue_timeout') return result;
  }
}

/**
 * Vòng đời một agent liên tục: quan sát → xin lượt AI → một lượt agy trong cùng hội thoại → thực thi action qua
 * `executeAction` hiện có (record-only, không submit) → nhả tab để autofill bấm gửi → chờ giao diện đổi → lặp.
 * Không thoát chỉ vì giao diện đứng yên; chỉ thoát khi Stop, tab đóng hoặc phiên đóng.
 *
 * @param {object} agent Agent đã đăng ký (page, session, getRecord, cfg, signal, transport, log).
 * @return {Promise<void>} Kết thúc khi agent dừng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function runContinuousAgent(agent) {
  const { page, session, signal, transport, cfg } = agent;
  let stagnant = 0, failures = 0, feedback = [];
  const alive = () => !signal.aborted && !page.isClosed() && !session.isClosed;
  while (alive()) {
    if (shouldStopAfterLead(session)) { setStatus(agent, 'waiting_lead', 'Đã có lead và đang bật dừng autofill; giữ tab, không thao tác', true); await sleep(2000, signal); continue; }
    const state = await readVisiblePageState(page);
    const gate = inspectAiStateGate(page, state);
    if (!gate.allowed) {
      setStatus(agent, 'waiting_page', gate.detail, gate.shouldLog);
      await waitForSignatureChange(page, session, state.signature, { signal, pollMs: 1500 });
      continue;
    }
    setStatus(agent, 'queued', 'Xin lượt AI');
    const capacity = await acquireCapacity(agent, state.signature);
    if (capacity === 'acquired' && !alive()) { moduleState.agtRunningCount = Math.max(0, moduleState.agtRunningCount - 1); break; }
    if (capacity === 'closed' || capacity === 'aborted') break;
    if (capacity !== 'acquired') { await sleep(500, signal); continue; } // page_changed: đọc lại giao diện

    let raw = null;
    setOwner(agent, true);
    try {
      if (transport.turns >= MAX_TURNS_PER_CONVERSATION) transport.close();
      const html = state.html, url = page.url();
      const prompt = transport.turns === 0 ? buildFirstPrompt({ url, record: agent.getRecord(), customInstructions: cfg.customInstructions, html }) : buildNextPrompt({ url, html, feedback });
      setStatus(agent, 'thinking', `Lượt ${transport.turns + 1} của hội thoại`);
      const startedAt = Date.now();
      try {
        raw = (await transport.send(prompt)).text;
        failures = 0; feedback = [];
        agent.turnCount += 1;
        agent.log({ time: new Date().toISOString(), type: 'continuous_reply', detail: `[Continuous AI] Phản hồi sau ${((Date.now() - startedAt) / 1000).toFixed(1)}s` });
      } catch (error) {
        if (signal.aborted) break;
        failures += 1;
        agent.log({ time: new Date().toISOString(), type: 'continuous_error', detail: `[Continuous AI] Lỗi gọi agy (lần ${failures}): ${error.message}` });
      }
    } finally {
      moduleState.agtRunningCount = Math.max(0, moduleState.agtRunningCount - 1);
    }
    if (raw === null) {
      setOwner(agent, false);
      const backoffMs = Math.min(300_000, 2000 * 2 ** Math.min(failures, 8));
      setStatus(agent, 'backing_off', `Lỗi agy; thử lại sau ${Math.round(backoffMs / 1000)}s`, true);
      await sleep(backoffMs, signal);
      continue;
    }

    // Còn giữ cờ owner: chỉ AI thao tác tab trong lúc thực thi action.
    let executed = 0;
    try {
      setStatus(agent, 'acting', 'Thực thi thao tác');
      for (const act of parseActions(raw)) {
        if (!alive() || shouldStopAfterLead(session)) break;
        const result = await executeAction(page, act, session, { allowSubmit: false, providedValuesOnly: true, record: agent.getRecord(), onLog: agent.log }).catch(error => ({ ok: false, reason: error.message }));
        if (result.ok) { executed += 1; agent.actionCount += 1; agent.lastProgressAt = Date.now(); }
        else {
          feedback.push(`${act.action} ${act.selector || '(thiếu selector)'}: ${result.reason}`);
          if (result.reason === 'scope_unavailable') break;
        }
        await sleep(300, signal);
      }
    } finally {
      setOwner(agent, false);
    }
    if (!alive()) break;

    // Nhả tab cho pipeline autofill kiểm tra và bấm gửi/Continue, rồi chờ giao diện mới (không giữ chỗ AI).
    session.triggerAutofillScan?.();
    setStatus(agent, 'waiting_page', executed ? 'Đã điền; chờ website chuyển bước' : 'AI chưa có thao tác; chờ giao diện đổi');
    const outcome = await waitForSignatureChange(page, session, state.signature, { signal, maxMs: executed ? WAIT_AFTER_ACTIONS_MS : WAIT_AFTER_EMPTY_MS });
    if (outcome === 'changed') { stagnant = 0; agent.lastProgressAt = Date.now(); continue; }
    if (outcome !== 'timeout') continue;
    stagnant += 1;
    feedback.push('giao diện không đổi sau lượt trước');
    if (stagnant >= AI_STALLED_ROUND_LIMIT) {
      blockAiForState(page, state.signature); // lượt sau gate chờ giao diện đổi, không gọi model lại
      stagnant = 0;
      setStatus(agent, 'waiting_page', 'Giao diện không đổi sau nhiều lượt; giữ tab và chờ thay đổi', true);
    }
  }
}
