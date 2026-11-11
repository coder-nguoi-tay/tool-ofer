import { isPlausibleGmail } from './is-plausible-gmail.mjs';

/**
 * Trích xuất email hợp lệ từ một dòng văn bản.
 * Hỗ trợ định dạng email đơn thuần hoặc email đi kèm mật khẩu, pipe (|), dấu phẩy.
 *
 * @param {string} line Dòng dữ liệu thô.
 * @return {string|null} Địa chỉ email viết thường hoặc null nếu không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function parseEmailLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const match = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match && isPlausibleGmail(match[0]) ? match[0].toLowerCase() : null;
}
export { parseEmailLine };
