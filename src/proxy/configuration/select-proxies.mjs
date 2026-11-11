import { parseProxyLine } from './parse-proxy-line.mjs';

/**
 * Đọc danh sách proxy từ giao diện và kiểm tra giới hạn số lượng.
 *
 * @param {string} proxyList Danh sách proxy nhiều dòng.
 * @param {string} proxyType Scheme mặc định cho dòng chỉ có host:port.
 * @param {*} requestedCount Số cửa sổ người dùng nhập, bỏ trống thì lấy hết.
 * @return {object[]} Danh sách proxy đã chọn.
 * @throws {Error} Khi danh sách rỗng hoặc số cửa sổ không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function selectProxies(proxyList, proxyType, requestedCount) {
  if (!['socks5', 'http'].includes(proxyType)) throw new Error('Loại proxy phải là socks5 hoặc http.');
  const wanted = requestedCount === undefined || requestedCount === '' ? Infinity : Number(requestedCount);
  if (wanted !== Infinity && (!Number.isInteger(wanted) || wanted < 1)) {
    throw new Error('Số cửa sổ phải là số nguyên lớn hơn 0.');
  }

  // Chỉ phân tích tới khi đủ số cửa sổ cần: một dòng sai ở dưới không được chặn cả lệnh.
  const proxies = [];
  for (const [index, line] of (proxyList ?? '').split(/\r?\n/).entries()) {
    if (proxies.length >= wanted) break;
    const proxy = parseProxyLine(line, index + 1, proxyType);
    if (proxy) proxies.push(proxy);
  }
  if (proxies.length === 0) throw new Error('Danh sách proxy không có dòng nào hợp lệ.');
  if (wanted !== Infinity && proxies.length < wanted) {
    throw new Error(`Bạn nhập ${wanted} cửa sổ nhưng danh sách chỉ có ${proxies.length} proxy hợp lệ.`);
  }
  return proxies;
}
export { selectProxies };
