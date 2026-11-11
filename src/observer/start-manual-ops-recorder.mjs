import { OBSERVER_INIT_SCRIPT } from './state/observer-init-script.mjs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createBatchedActionWriter } from './create-batched-action-writer.mjs';
import { isDetailedRecording } from '../logging/recorder/recording-policy.mjs';

/**
 * Thu hành động mọi frame vào bộ đệm chẩn đoán; mặc định chỉ ghi mốc nghiệp vụ vào nhật ký chính.
 * JSONL chỉ ghi bất đồng bộ khi người dùng bật debug có thời hạn cho phiên này.
 * @param {object} context BrowserContext Playwright.
 * @param {object} session Phiên trình duyệt đang được quan sát.
 * @param {string} appDataDirectory Thư mục dữ liệu ứng dụng.
 * @param {object} options Callback onLog và chu kỳ poll dự phòng.
 * @return {object} Đường dẫn debug JSONL, Promise ready, flush và stop bất đồng bộ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function startManualOpsRecorder(context, session, appDataDirectory, options = {}) {
  const directory = join(appDataDirectory, 'logs');
  const filePath = join(directory, `manual-ops-${session.recordingId || randomUUID()}.jsonl`);
  const writer = createBatchedActionWriter(filePath, detail => options.onLog?.({ type: 'recorder_error', source: 'system', detail }));
  session.flushRecorderLogs = writer.flush;
  let stopped = false;
  let bindingReady = false;

  /**
   * Lưu hành động đã giới hạn dữ liệu, không nhận kiểu log hay đường dẫn do trang cung cấp.
   * @param {object} event Sự kiện từ script quan sát.
   * @param {object} page Tab nguồn do Playwright xác nhận.
   * @return {void} Giữ ngữ cảnh gần nhất, ghi mốc nghiệp vụ hoặc JSONL debug có thời hạn.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  function record(event, page) {
    if (stopped || !event || !['click', 'submit', 'input', 'change', 'keydown', 'scroll', 'form_state', 'navigate', 'unload'].includes(event.kind)) return;
    const action = {
      kind: event.kind, ts: new Date().toISOString(), frm: String(event.frm || '').slice(0, 2000),
      trusted: event.trusted === true, key: ['Enter', 'Tab', 'Escape'].includes(event.key) ? event.key : undefined,
      x: Number.isFinite(event.x) ? event.x : undefined, y: Number.isFinite(event.y) ? event.y : undefined,
      scrollX: Number.isFinite(event.scrollX) ? event.scrollX : undefined, scrollY: Number.isFinite(event.scrollY) ? event.scrollY : undefined,
      visible: typeof event.visible === 'boolean' ? event.visible : undefined,
      created: typeof event.created === 'boolean' ? event.created : undefined,
      removed: typeof event.removed === 'boolean' ? event.removed : undefined,
      from: String(event.from || '').slice(0, 2000), to: String(event.to || '').slice(0, 2000),
      el: event.el && typeof event.el === 'object' ? Object.fromEntries(['tag', 'id', 'name', 'cls', 'text', 'href', 'target', 'type', 'filled', 'checked'].filter(key => key in event.el).map(key => [key, typeof event.el[key] === 'boolean' ? event.el[key] : String(event.el[key]).slice(0, 200)])) : null,
    };
    session.recordRecentBrowserAction?.(page, action);
    const detailed = isDetailedRecording(session);
    if (detailed) writer.append({ session: session.recordingId, slot: session.slot ?? (session.tileIndex ?? 0) + 1, ...action });
    if (['input', 'scroll', 'keydown', 'unload'].includes(action.kind)) return;
    if (action.kind === 'click' && !/^(a|button|input|label|select)$/.test(action.el?.tag || '') && !/answer|choice|option|button|offer/i.test(action.el?.cls || '')) return;
    options.onLog?.({ type: 'browser_action', source: 'browser', ...action, detail: `${action.kind}: ${action.el?.tag || ''} ${action.el?.id ? '#' + action.el.id : ''} ${action.el?.text || ''}`.trim() }, page);
  }

  const ready = (async () => {
    try {
      await context.exposeBinding('__autoleadBrowserEvent', (source, event) => record(event, source.page));
      bindingReady = true;
    } catch {}
    await context.addInitScript(OBSERVER_INIT_SCRIPT);
    await Promise.all(context.pages().filter(page => !page.isClosed()).flatMap(page => page.frames().map(frame => frame.evaluate(OBSERVER_INIT_SCRIPT).catch(() => {}))));
  })().catch(error => options.onLog?.({ type: 'recorder_error', source: 'system', detail: error.message }));
  const timer = setInterval(async () => {
    if (stopped || bindingReady) return;
    for (const page of context.pages()) {
      if (page.isClosed()) continue;
      const events = await page.evaluate(() => { const events = window.__manualOpsQueue || []; window.__manualOpsQueue = []; return events; }).catch(() => []);
      for (const event of events || []) record(event, page);
    }
  }, options.intervalMs || 3000);
  timer.unref?.();
  /**
   * Dừng poll dự phòng khi phiên kết thúc.
   * @return {Promise<void>} Hủy timer và ghi nốt lô JSONL debug đã nhận.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  async function stop() { stopped = true; clearInterval(timer); await writer.stop(); }
  context.on('close', stop);
  return { filePath, ready, stop, flush: writer.flush };
}
