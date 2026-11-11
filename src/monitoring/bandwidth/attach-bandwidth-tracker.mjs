import { formatBytes } from './format-bytes.mjs';
import { recordBandwidthUsage } from './record-bandwidth-usage.mjs';

/**
 * Theo dõi lưu lượng từng request và cập nhật thống kê phiên duyệt.
 * @param {object} context BrowserContext cần theo dõi.
 * @param {object} session Phiên duyệt được cập nhật thống kê.
 * @return {void} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function attachBandwidthTracker(context, session) {
  if (!context || !session) return;
  if (session._bandwidthTrackerAttached) return;
  session._bandwidthTrackerAttached = true;
  session.bandwidthBytes = session.bandwidthBytes || 0;
  session.bytesSent = session.bytesSent || 0;
  session.bytesReceived = session.bytesReceived || 0;
  session.requestCount = session.requestCount || 0;
  session.bandwidthFormatted = formatBytes(session.bandwidthBytes);
  const handleRequestFinishedOrFailed = async req => {
    try {
      const sizes = await req.sizes().catch(() => null);
      if (!sizes) return;
      const up = Math.max(0, (sizes.requestHeadersSize || 0) + (sizes.requestBodySize || 0));
      const down = Math.max(0, (sizes.responseHeadersSize || 0) + (sizes.responseBodySize || 0));
      const bytes = up + down;
      if (bytes <= 0) return;
      session.bytesSent = (session.bytesSent || 0) + up;
      session.bytesReceived = (session.bytesReceived || 0) + down;
      session.bandwidthBytes = (session.bandwidthBytes || 0) + bytes;
      session.requestCount = (session.requestCount || 0) + 1;
      session.bandwidthFormatted = formatBytes(session.bandwidthBytes);

      // Ghi nhận băng thông cho từng tab cụ thể
      const page = req.frame()?.page?.();
      if (page) {
        page._bytesSent = (page._bytesSent || 0) + up;
        page._bytesReceived = (page._bytesReceived || 0) + down;
        page._bandwidthBytes = (page._bandwidthBytes || 0) + bytes;
        page._requestCount = (page._requestCount || 0) + 1;
        page._bandwidthFormatted = formatBytes(page._bandwidthBytes);
      }
      recordBandwidthUsage(bytes, up, down);
    } catch {}
  };
  context.on('requestfinished', handleRequestFinishedOrFailed);
  context.on('requestfailed', handleRequestFinishedOrFailed);
}
export { attachBandwidthTracker };
