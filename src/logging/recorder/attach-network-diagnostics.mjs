import { randomUUID } from 'node:crypto';
import { queueSaveBrowserLogs } from '../browser-logs/queue-save-browser-logs.mjs';
import { isDetailedRecording } from './recording-policy.mjs';

/**
 * Gộp lưu lượng nền theo 30 giây; giữ request tài liệu chính, POST form và lỗi API để chẩn đoán.
 * Debug có thời hạn giữ từng document/xhr/fetch, không đọc header hoặc body request.
 * @param {object} page Tab Playwright được quan sát.
 * @param {Function} addLog Hàm ghi sự kiện của phiên.
 * @param {Function} recordFailure Hàm ghi lỗi vào bộ gộp chung.
 * @param {object} [session={}] Phiên để kiểm tra debug và lưu ngữ cảnh mạng.
 * @return {void} Đăng ký listener và hủy timer khi tab đóng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function attachNetworkDiagnostics(page, addLog, recordFailure, session = {}) {
  const requests = new WeakMap();
  const inFlight = new Set();
  let counts = { started: 0, finished: 0, failed: 0, httpErrors: 0, blockedByPolicy: 0 };
  /**
   * Phát một dòng tổng hợp, kèm tối đa năm API chờ lâu để phát hiện web đứng do network.
   * @return {void} Đặt lại bộ đếm, giữ các request chưa hoàn tất trong giới hạn bộ nhớ.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  function flushSummary() {
    if (!Object.values(counts).some(Boolean) && !inFlight.size) return;
    const slowRequests = [...inFlight].filter(record => Date.now() - record.startedAt >= 15_000).slice(0, 5).map(record => ({
      url: record.url.split(/[?#]/)[0], method: record.method, resourceType: record.resourceType,
      waitingMs: Date.now() - record.startedAt,
    }));
    addLog({ type: 'network_summary', source: 'browser', ...counts, pending: inFlight.size, slowRequests,
      detail: 'Tổng hợp mạng trong 30 giây; request nền thành công không ghi riêng.' }, page);
    counts = { started: 0, finished: 0, failed: 0, httpErrors: 0, blockedByPolicy: 0 };
  }
  const timer = setInterval(flushSummary, 30_000);
  timer.unref?.();
  page.on('close', () => { clearInterval(timer); flushSummary(); inFlight.clear(); });
  page.on('request', request => {
    const resourceType = request.resourceType();
    if (!['document', 'xhr', 'fetch'].includes(resourceType)) return;
    const url = request.url();
    const method = request.method();
    let sameOrigin = true;
    try { sameOrigin = new URL(url).origin === new URL(page.url()).origin; } catch {}
    const mainDocument = resourceType === 'document' && (!request.frame || request.frame() === page.mainFrame?.());
    const critical = mainDocument || sameOrigin && !['GET', 'HEAD', 'OPTIONS'].includes(method);
    const entry = critical || isDetailedRecording(session) ? addLog({
      type: 'network_request', source: 'browser', requestId: randomUUID(), url,
      method, resourceType, outcome: 'pending', detail: `${method} ${resourceType}`,
    }, page) : null;
    const record = { entry, url, method, resourceType, startedAt: Date.now() };
    requests.set(request, record);
    if (inFlight.size >= 200) inFlight.delete(inFlight.values().next().value);
    inFlight.add(record);
    counts.started++;
  });
  page.on('response', response => {
    const record = requests.get(response.request());
    if (!record) return;
    const status = response.status();
    if (status >= 400) {
      counts.httpErrors++;
      if (!record.entry) record.entry = addLog({ type: 'network_request', source: 'browser', requestId: randomUUID(),
        coalesceAsFailure: true, status, url: record.url, method: record.method, resourceType: record.resourceType, outcome: 'http_error', detail: 'Nhóm request trả cùng lỗi HTTP; trạng thái là lần gần nhất.' }, page);
      recordFailure({ type: 'http_error', requestId: record.entry.requestId, url: record.url, status,
        method: record.method, detail: `HTTP ${status} ${response.statusText()}` });
    }
    if (record.entry) { record.entry.status = status; record.entry.timeToHeadersMs = Date.now() - record.startedAt; queueSaveBrowserLogs(); }
  });
  page.on('requestfinished', request => {
    const record = requests.get(request);
    if (!record) return;
    counts.finished++;
    inFlight.delete(record);
    if (record.entry) { Object.assign(record.entry, { outcome: 'finished', durationMs: Date.now() - record.startedAt }); queueSaveBrowserLogs(); }
  });
  page.on('requestfailed', request => {
    const record = requests.get(request);
    if (!record) return;
    inFlight.delete(record);
    const detail = request.failure()?.errorText || 'Request failed';
    if (/ERR_BLOCKED_BY_CLIENT/.test(detail) && !isDetailedRecording(session)) {
      counts.blockedByPolicy++;
      if (record.entry) { Object.assign(record.entry, { outcome: 'blocked_by_policy' }); queueSaveBrowserLogs(); }
      return;
    }
    counts.failed++;
    if (!record.entry) record.entry = addLog({ type: 'network_request', source: 'browser', requestId: randomUUID(),
      coalesceAsFailure: true, url: record.url, method: record.method, resourceType: record.resourceType, detail: 'Nhóm request kết nối thất bại; trạng thái là lần gần nhất.' }, page);
    Object.assign(record.entry, { outcome: 'failed', durationMs: Date.now() - record.startedAt, failure: detail });
    recordFailure({ type: 'request_failed', requestId: record.entry.requestId, url: record.url, method: record.method,
      resourceType: record.resourceType, detail, blockedAtClient: /ERR_BLOCKED_BY_CLIENT/.test(detail) });
    session.recordRecentBrowserAction?.(page, { kind: 'network_failed', frm: record.url.split(/[?#]/)[0], ts: new Date().toISOString() });
  });
}
