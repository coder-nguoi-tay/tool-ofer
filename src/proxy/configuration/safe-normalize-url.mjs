import { normalizeUrl } from './normalize-url.mjs';

/**
 * Chuẩn hoá URL an toàn không ném ngoại lệ khi URL rác, dùng để sinh key kiểm tra trùng IP.
 *
 * @param {string} input Chuỗi URL thô.
 * @return {string} URL đã chuẩn hoá hoặc chuỗi đã trim nếu không parse được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function safeNormalizeUrl(input) {
  if (!input) return '';
  try {
    return normalizeUrl(input);
  } catch {
    return String(input).trim();
  }
}
export { safeNormalizeUrl };
