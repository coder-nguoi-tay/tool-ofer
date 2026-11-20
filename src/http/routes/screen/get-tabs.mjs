import { activeBrowsers } from '../../../browser/sessions.mjs';
import { formatBytes } from '../../../monitoring/bandwidth.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

const tabTitles = new WeakMap();

/**
 * Đọc tiêu đề để hiển thị trên thanh tab. Lần đầu chờ tối đa 50 ms, các lần
 * cập nhật sau dùng tiêu đề đã có trong lúc trình duyệt xử lý yêu cầu mới.
 * @param {import('playwright').Page} page Tab đang mở.
 * @param {string} url Địa chỉ ứng với tiêu đề đang đọc.
 * @return {Promise<string>} Tiêu đề hoặc chuỗi rỗng để giao diện dùng nhãn dự phòng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function readTabTitle(page, url) {
  const previous = tabTitles.get(page);
  const sameUrl = previous?.url === url;
  if (sameUrl && (previous.reading || Date.now() < previous.refreshAfter)) {
    return previous.title;
  }
  const entry = { url, title: sameUrl ? previous.title : '', reading: true };
  tabTitles.set(page, entry);
  const reading = page.title().then(title => { entry.title = title; }, () => {}).finally(() => {
    entry.reading = false;
    entry.refreshAfter = Date.now() + 5000;
  });
  if (!sameUrl) {
    let timer;
    try {
      await Promise.race([reading, new Promise(resolve => { timer = setTimeout(resolve, 50); })]);
    } finally {
      clearTimeout(timer);
    }
  }
  return entry.title;
}

/**
 * Liệt kê các tab còn mở cùng tiêu đề và thống kê băng thông cho Screen View.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function handleGetScreenTabs(request, response) {
  if (request.method === 'GET' && request.url.startsWith('/screen/tabs/')) {
    const slot = parseInt(request.url.split('/').pop(), 10);
    const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
    if (!session) {
      respondWithJson(response, 404, {
        error: 'not found'
      });
      return true;
    }
    const pages = session.browser.pages().filter(p => !p.isClosed());
    const tabs = await Promise.all(pages.map(async (page, index) => {
      const url = page.url();
      return {
        index, url, title: await readTabTitle(page, url),
        bandwidthBytes: page._bandwidthBytes || 0,
        bandwidthFormatted: formatBytes(page._bandwidthBytes || 0),
        bytesSent: page._bytesSent || 0,
        bytesReceived: page._bytesReceived || 0,
        requestCount: page._requestCount || 0
      };
    }));
    respondWithJson(response, 200, {
      tabs,
      bandwidthBytes: session.bandwidthBytes || 0,
      bandwidthFormatted: formatBytes(session.bandwidthBytes || 0),
      bytesSent: session.bytesSent || 0,
      bytesReceived: session.bytesReceived || 0,
      requestCount: session.requestCount || 0
    });
    return true;
  }
  return false;
}
