import { randomUUID } from 'node:crypto';
import { queueSaveBrowserLogs } from './browser-logs.mjs';
import { stampLogSeq } from './browser-logs/stamp-log-seq.mjs';
import { attachSessionLifecycleLogger } from './attach-session-lifecycle-logger.mjs';
import { browserIpCheckUrls, browserGeoCheckUrl } from '../runtime/constants/browser-ip-check-urls.mjs';

const probeHosts = new Set([...browserIpCheckUrls, browserGeoCheckUrl].map(value => new URL(value).hostname));

/**
 * Lưu lỗi mở trang đầu tiên và mốc lead/đóng phiên; bỏ log thao tác và trang vào được.
 * @param {object} context BrowserContext của phiên.
 * @param {object} session Phiên nhận callback log vòng đời, giữ nguyên tiến trình autofill/AI.
 * @param {object} recording Metadata và danh sách kết quả mở trang của phiên.
 * @return {void} Gắn listener tải trang, không tạo recorder/ảnh/HTML/JSONL.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function attachPageAccessLogger(context, session, recording) {
  const watched = new WeakSet(), completed = new WeakSet(), statuses = new WeakMap(), tabIds = new WeakMap();
  let nextTabId = 0;
  session.logs = recording.logs;
  session.addBrowserLog = session.addLog = attachSessionLifecycleLogger(context, session, recording);
  session.recordRecentBrowserAction = () => {};

  /**
   * Chốt kết quả mở trang; chỉ ghi khi thất bại, bỏ query chứa dữ liệu cá nhân.
   * @param {object} page Tab mở trang.
   * @param {string} url URL tài liệu được kiểm tra.
   * @param {boolean} loaded Trang vào được hay thất bại.
   * @param {number} status Mã HTTP, 0 khi không nhận được response.
   * @return {void} Ghi tối đa một lỗi hoặc dừng im lặng khi mở trang thành công.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-13
   */
  function report(page, url, loaded, status = 0) {
    if (completed.has(page) || !/^https?:\/\//i.test(url)) return;
    const safeUrl = new URL(url); safeUrl.search = ''; safeUrl.hash = '';
    if (probeHosts.has(safeUrl.hostname) || safeUrl.hostname === 'toffers.top' && safeUrl.pathname.startsWith('/click')) return;
    completed.add(page);
    if (loaded) return;
    recording.ip = session.exitIp ?? recording.ip;
    const entry = { id: randomUUID(), type: 'page_access_failed', time: new Date().toISOString(), sequence: recording.logs.length + 1,
      source: 'browser', tabId: tabIds.get(page), url: safeUrl.href, pageUrl: safeUrl.href, status, detail: 'Không vào được trang.' };
    recording.logs.push(entry);
    stampLogSeq(entry);
    queueSaveBrowserLogs(250);
    console.log(`[PageAccess] Slot ${recording.slot}: ${entry.detail} ${entry.url}${status ? ` (HTTP ${status})` : ''}`);
  }

  /**
   * Theo dõi response tài liệu chính, không ghi request nền hoặc iframe.
   * @param {object} page Tab hiện tại hoặc vừa mở.
   * @return {void} Đăng ký listener một lần.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-13
   */
  function watch(page) {
    if (watched.has(page)) return;
    watched.add(page);
    tabIds.set(page, ++nextTabId);
    page.on('response', response => {
      if (completed.has(page)) return;
      try {
        if (!response.request().isNavigationRequest() || response.frame() !== page.mainFrame()) return;
        const status = response.status();
        if (status >= 300 && status < 400) return;
        statuses.set(page, status);
        if (status >= 400) report(page, response.url(), false, status);
      } catch {}
    });
    page.on('domcontentloaded', () => {
      const status = statuses.get(page) || 0;
      report(page, page.url(), status < 400, status);
    });
    page.on('requestfailed', request => {
      if (completed.has(page)) return;
      try {
        if (request.isNavigationRequest() && request.frame() === page.mainFrame() && request.failure()?.errorText !== 'net::ERR_ABORTED') report(page, request.url(), false);
      } catch {}
    });
    const url = page.url();
    if (/^https?:\/\//i.test(url)) void page.evaluate(() => document.readyState).then(state => {
      if (page.url() === url && ['interactive', 'complete'].includes(state)) report(page, url, true);
    }).catch(() => {});
  }
  context.on('page', watch);
  context.pages().forEach(watch);
}
