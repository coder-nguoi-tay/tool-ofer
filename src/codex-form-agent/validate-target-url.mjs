/**
 * Xác thực cú pháp và giao thức URL trước khi mở.
 *
 * @param {string} targetUrl URL cần kiểm tra.
 * @param {string[]} [allowlist=[]] Danh sách domain cho phép (nếu có).
 * @returns {URL} URL object hợp lệ.
 * @throws {Error} Nếu URL không hợp lệ hoặc sai giao thức.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function validateTargetUrl(targetUrl, allowlist = []) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw new Error('URL trang đích không hợp lệ hoặc bị trống.');
  }
  let parsed;
  try {
    parsed = new URL(targetUrl);
  } catch (err) {
    throw new Error(`Định dạng URL không hợp lệ: ${err.message}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Giao thức không được phép: ${parsed.protocol}. Chỉ chấp nhận http: hoặc https:`);
  }
  if (allowlist && allowlist.length > 0) {
    const isAllowed = allowlist.some(domain => {
      const normalizedDomain = domain.toLowerCase().trim();
      const hostname = parsed.hostname.toLowerCase();
      return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
    });
    if (!isAllowed) {
      throw new Error(`Tên miền ${parsed.hostname} không nằm trong danh sách cho phép (allowlist).`);
    }
  }
  return parsed;
}
export { validateTargetUrl };
