import { waitForAiCapacity } from '../ai-assist/wait-for-ai-capacity.mjs';
import { moduleState } from '../ai-assist/state/module-state.mjs';
import { shouldPauseForLead } from '../autofill/should-pause-for-lead.mjs';
import { shouldStopAfterLead } from '../autofill/should-stop-after-lead.mjs';
import { buildSelectCandidates } from '../autofill/select/build-select-candidates.mjs';
import { operateOnForm } from '../form-mcp/operate-on-form.mjs';
import { suppliedValue } from '../form-mcp/supplied-value.mjs';
import { setOwner, setStatus } from './run-continuous-agent.mjs';
import { sleep } from './wait-for-signature-change.mjs';

/**
 * Theo dõi đúng form mà website đích công bố từ lúc mở tab đến khi hủy. Model chỉ chọn khóa trường.
 * @param {object} agent Agent của tab với origin lúc mở, nguồn record, transport và tín hiệu dừng.
 * @return {Promise<void>} Hoàn tất sau khi trả handle của form và lượt AI.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function runDashboardFormAgent(agent) {
  const { page, session, signal, allowedOrigin: origin, transport } = agent;
  /**
   * Lấy record của tab; chỉ tab chính được dùng record của phiên.
   * @return {object|undefined} Record app đã phân cho tab.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-19
   */
  const currentRecord = () => page._assignedRecord || (page === session.mainPage && agent.getRecord());
  /**
   * Kiểm tra vòng đời tab, phiên và yêu cầu dừng từ Vận hành.
   * @return {boolean} Agent còn được theo dõi tab.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-19
   */
  const active = () => !signal.aborted && !session.isClosed && !page.isClosed();
  /**
   * Xác minh origin được cấu hình và các trạng thái dừng trước khi dùng record.
   * @return {boolean} Có thể đọc hoặc điền các trường đã khai báo trên tab.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-19
   */
  const allowed = () => {
    if (!active() || page._leadRecoveryInProgress || shouldStopAfterLead(session) || shouldPauseForLead(session) ||
        ['manual', 'skip', 'consent_only'].includes(session.offerMode) || !URL.canParse(page.url())) return false;
    const url = new URL(page.url());
    const secure = url.protocol === 'https:' || (url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname));
    return secure && url.origin === origin;
  };
  let form, previousFields, previousRecord;
  let retryDelay = 3000;
  try {
    while (active()) {
      let acquired = false;
      let delay = 600;
      try {
        setStatus(agent, 'waiting_page', 'Chờ trường cần điền trên form đã khai báo của website đích');
        if (!allowed() || !currentRecord()) continue;
        if (!form) {
          const forms = page.locator('form[data-autoleadpc-mcp="record"]');
          if (await forms.count() !== 1) continue;
          form = await forms.elementHandle({ timeout: 1200 });
          previousFields = null;
        }
        const inspection = await form.evaluate(operateOnForm, { origin, pendingOnly: true, requireSingle: true });
        if (!inspection.fields) throw new Error('Form đã đổi');
        const record = currentRecord();
        if (!record) continue;
        const fields = inspection.fields.filter(({ field }) => suppliedValue(record, field, session) !== null);
        const signature = JSON.stringify(fields);
        if (!fields.length || previousFields === signature && previousRecord === record) {
          if (!fields.length) previousFields = null;
          continue;
        }
        setStatus(agent, 'queued', 'Đang chờ lượt AI');
        acquired = await waitForAiCapacity(page, session, null, 15_000, null, signal) === 'acquired';
        if (!acquired || !allowed() || currentRecord() !== record) continue;
        setOwner(agent, true);
        setStatus(agent, 'thinking', 'AI đang xác định trường cần điền');
        if (transport.turns >= 25) transport.close();
        const prompt = 'Chọn các khóa trường cần điền từ danh sách. Chỉ trả một mảng JSON các chuỗi khóa. App cung cấp giá trị và xử lý lựa chọn.\n' + signature;
        const { text } = await transport.send(prompt);
        retryDelay = 3000;
        agent.turnCount++;
        agent.log({ type: 'form_agent_reply', detail: `AI đã trả lời cho ${fields.length} trường của form.` });
        previousFields = signature;
        previousRecord = record;
        let requested;
        try {
          requested = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ''));
        } catch { continue; }
        if (!Array.isArray(requested)) continue;
        setStatus(agent, 'acting', 'Đang điền từ record của tab');
        for (const { field } of fields) {
          if (!allowed() || currentRecord() !== record) break;
          if (!requested.includes(field)) continue;
          const value = suppliedValue(record, field, session);
          if (value === null) continue;
          const operation = { origin, field, value, candidates: buildSelectCandidates(value, { name: field }), requireSingle: true, onlyIfPending: true };
          const result = await form.evaluate(operateOnForm, operation);
          if (!result.verified) continue;
          await sleep(550, signal);
          if (!allowed() || currentRecord() !== record) break;
          const retained = await form.evaluate(operateOnForm, { ...operation, verifyOnly: true });
          if (retained.verified) { agent.actionCount++; agent.lastProgressAt = Date.now(); }
        }
      } catch {
        if (form) await form.dispose().catch(() => {});
        form = null;
        if (active()) {
          setStatus(agent, 'backing_off', 'Đang chờ thử lại sau khi mất kết nối với form hoặc AI', true);
        }
        delay = retryDelay;
        retryDelay = Math.min(30000, retryDelay * 2);
      } finally {
        if (acquired) {
          setOwner(agent, false);
          moduleState.agtRunningCount = Math.max(0, moduleState.agtRunningCount - 1);
        }
        await sleep(delay, signal);
      }
    }
  } finally {
    if (form) await form.dispose().catch(() => {});
  }
}
