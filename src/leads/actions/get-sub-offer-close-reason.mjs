// Quy tắc người dùng chốt (2026-11-12): tab offer phụ gặp các trang này thì đóng tab.
const TEXT_RULES = [
  [/this offer is no longer available/i, 'Offer phụ hết hạn (This offer is no longer available)'],
  [/please check your email/i, 'Offer phụ dừng ở bước xác minh email (Please check your email)'],
];
const HOST_RULES = [
  [/(^|\.)lifepointspanel\.com$/i, 'Offer phụ LifePoints Panel (lifepointspanel.com)'],
  // 2026-11-13: chỉ trang chủ yougov.com; account.yougov.com là form khảo sát đang điền nên giữ.
  [/^(www\.)?yougov\.com$/i, 'Offer phụ dừng ở trang chủ YouGov (yougov.com)'],
];
// Quy tắc theo host + đường dẫn (2026-11-13).
const PATH_RULES = [
  [/^(www\.)?super\.com$/i, /^\/home\/landings\/earn(\/|$)/i, 'Offer phụ landing "earn" của super.com'],
];

/**
 * Lý do đóng tab offer phụ theo URL/chữ trang, hoặc null nếu giữ tab.
 *
 * @param {{url?: string, text?: string}} pageInfo URL và chữ hiển thị của tab.
 * @return {string|null} Lý do đóng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function matchSubOfferCloseReason({ url = '', text = '' } = {}) {
  let host = '';
  try { host = new URL(url).hostname; } catch {}
  let path = '';
  try { path = new URL(url).pathname; } catch {}
  for (const [pattern, reason] of HOST_RULES) if (host && pattern.test(host)) return reason;
  for (const [hostPattern, pathPattern, reason] of PATH_RULES) if (host && hostPattern.test(host) && pathPattern.test(path)) return reason;
  for (const [pattern, reason] of TEXT_RULES) if (pattern.test(text)) return reason;
  return null;
}

/**
 * Chạy trong trang: chữ hiển thị của body (giới hạn độ dài).
 * @return {string} Chữ của trang.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function readSubOfferText() {
  return String(document.body?.innerText || '').slice(0, 5000);
}

/**
 * Đọc URL + chữ tab rồi áp quy tắc đóng tab offer phụ. Đọc chữ có hạn 1,5s; lỗi/trang đang chuyển thì giữ tab.
 *
 * @param {object} page Tab Playwright (không phải tab đầu).
 * @return {Promise<string|null>} Lý do đóng hoặc null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function readSubOfferCloseReason(page) {
  const url = typeof page.url === 'function' ? page.url() : '';
  const byUrl = matchSubOfferCloseReason({ url });
  if (byUrl) return byUrl;
  let timer;
  const text = await Promise.race([
    Promise.resolve().then(() => page.evaluate(readSubOfferText)).catch(() => ''),
    new Promise(resolve => { timer = setTimeout(() => resolve(''), 1500); timer.unref?.(); }),
  ]).finally(() => clearTimeout(timer));
  return matchSubOfferCloseReason({ url, text: typeof text === 'string' ? text : '' });
}
