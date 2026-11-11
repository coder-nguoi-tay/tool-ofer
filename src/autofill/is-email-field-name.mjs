import { normalizeFieldName } from './normalize-field-name.mjs';

/**
 * Kiểm tra xem tên candidate có phải là trường email hay không.
 * Phân biệt chính xác giữa email và mailing address / postal address.
 *
 * @param {string} candidate Tên trường hoặc id/label.
 * @return {boolean}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function isEmailFieldName(candidate) {
  const norm = normalizeFieldName(candidate);
  if (!norm) return false;
  if (/email/i.test(norm)) return true;
  if (/^(mail|thudientu|usermail|customermail)$/i.test(norm)) return true;
  if (/mail/i.test(norm) && !/address|street|diachi|box|list|city|town|state|zip|postal/i.test(norm)) return true;
  return false;
}
export { isEmailFieldName };
