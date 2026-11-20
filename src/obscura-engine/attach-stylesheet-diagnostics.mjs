import { createHash } from 'node:crypto';

/**
 * Ghi chẩn đoán CSS theo tab khi người vận hành bật debug, gồm phản hồi mạng
 * và trạng thái stylesheet trong DOM sau sự kiện tải trang hoặc tải CSS.
 * @param {object} context BrowserContext đã kết nối.
 * @param {number} slot Slot sở hữu context.
 * @return {void} Các listener sống cùng tab và context hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function attachStylesheetDiagnostics(context, slot) {
  if (process.env.AUTOLEADPC_CSS_DEBUG !== '1') return;
  const watched = new WeakSet();
  let nextTab = 0;

  /** @param {object} page Tab hiện có hoặc mới mở. @return {void} Gắn một bộ listener.
   * @author ductv <ductv@getflycrm.com> @since 2026-11-20 */
  function watch(page) {
    if (watched.has(page)) return;
    watched.add(page);
    const tab = ++nextTab;
    let windowStart = Date.now();
    let emitted = 0;
    let successfulResponses = 0;
    let snapshotTimer;
    let readingSnapshot = false;

    /** @param {string} message Chi tiết đã lọc. @param {boolean} routine Phản hồi thành công thông thường. @return {void} Giới hạn log mỗi phút của tab.
     * @author ductv <ductv@getflycrm.com> @since 2026-11-20 */
    function report(message, routine = false) {
      if (Date.now() - windowStart >= 60000) { windowStart = Date.now(); emitted = 0; successfulResponses = 0; }
      if (emitted > 60 || (routine && successfulResponses++ >= 10)) return;
      console.info(`[Process] [CSS] ${new Date().toISOString()} slot=${slot} tab=${tab} ${emitted === 60 ? 'event=rate_limit' : message}`);
      emitted++;
    }

    /** @param {string} raw URL của tài nguyên. @return {string} Mã đối chiếu không chứa URL hay tham số.
     * @author ductv <ductv@getflycrm.com> @since 2026-11-20 */
    function assetId(raw) {
      if (!/^https?:/i.test(raw)) return 'local';
      try {
        const url = new URL(raw);
        return createHash('sha256').update(url.origin + url.pathname).digest('hex').slice(0, 12);
      } catch { return 'unknown'; }
    }

    page.on('response', response => {
      const request = response.request();
      if (request.resourceType() !== 'stylesheet') return;
      scheduleSnapshot();
      const status = response.status();
      const type = response.headers()['content-type']?.split(';')[0].trim().toLowerCase();
      const mime = !type ? 'missing' : type === 'text/css' ? 'css' : type === 'text/html' ? 'html' : 'other';
      const timing = request.timing().responseStart;
      const timingField = Number.isFinite(timing) && timing >= 0 ? ` response_start_ms=${Math.round(timing)}` : '';
      const result = status === 0 ? 'network_error' : status >= 400 ? 'http_error' : status === 304 ? 'not_modified' : status >= 300 ? 'redirect' :
        mime === 'css' ? 'ok' : 'unexpected_mime';
      report(`event=response asset=${assetId(response.url())} status=${status} mime=${mime} result=${result}${timingField}`, result === 'ok' || result === 'not_modified');
    });
    page.on('requestfailed', request => {
      if (request.resourceType() !== 'stylesheet') return;
      scheduleSnapshot();
      const error = request.failure()?.errorText || '';
      const reason = /resource limit/i.test(error) ? 'resource_limit' : /timed?[ _-]*out/i.test(error) ? 'timeout' :
        /block|denied/i.test(error) ? 'blocked' : /abort|cancel/i.test(error) ? 'cancelled' :
        /name_not_resolved|dns/i.test(error) ? 'dns' : /cert|ssl|tls/i.test(error) ? 'tls' :
        /connection.refused|connection.reset/i.test(error) ? 'connection' : 'network_error';
      report(`event=failed asset=${assetId(request.url())} reason=${reason}`);
    });
    /** @return {void} Lấy một mẫu sau các sự kiện CSS gần nhau, kể cả khi trang đã load.
     * @author ductv <ductv@getflycrm.com> @since 2026-11-20 */
    function scheduleSnapshot() {
      if (snapshotTimer || readingSnapshot) return;
      snapshotTimer = setTimeout(inspectStylesheets, 250);
      snapshotTimer.unref();
    }

    /** @return {Promise<void>} Hoàn tất lượt đọc tối đa mười frame trong tab.
     * @author ductv <ductv@getflycrm.com> @since 2026-11-20 */
    async function inspectStylesheets() {
      snapshotTimer = null;
      if (page.isClosed() || (emitted > 60 && Date.now() - windowStart < 60000)) return;
      readingSnapshot = true;
      await Promise.allSettled(page.frames().slice(0, 10).map(async frame => {
        const scope = frame === page.mainFrame() ? 'main' : 'child';
        const counts = await frame.evaluate(() => {
          const links = document.querySelectorAll('link[rel~="stylesheet" i]');
          let ready = 0, inactive = 0, missing = 0;
          const missingUrls = [];
          for (const link of links) {
            if (link.disabled || (link.media && !matchMedia(link.media).matches)) inactive++;
            else if (link.sheet) ready++;
            else {
              missing++;
              if (missingUrls.length < 3 && /^https?:/i.test(link.href)) missingUrls.push(link.href);
            }
          }
          return { ready, inactive, missing, missingUrls };
        });
        if (Array.isArray(counts?.missingUrls) && [counts.ready, counts.inactive, counts.missing].every(Number.isSafeInteger)) {
          const assets = counts.missingUrls.map(assetId).join(',');
          report(`event=dom_snapshot frame=${scope} sheet_present=${counts.ready} inactive=${counts.inactive} sheet_missing=${counts.missing}${assets ? ' missing_assets=' + assets : ''}`);
        }
      }));
      readingSnapshot = false;
    }
    page.on('load', scheduleSnapshot);
    page.once('close', () => clearTimeout(snapshotTimer));
  }
  context.on('page', watch);
  context.pages().forEach(watch);
}
