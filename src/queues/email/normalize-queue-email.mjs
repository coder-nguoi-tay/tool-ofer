import { isPlausibleGmail } from './is-plausible-gmail.mjs';

/**
 * Chuẩn hoá một dòng trong danh sách email: lấy phần email hợp lệ ở đầu dòng (cho phép "email|pass", "email:pass"),
 * trả null nếu email dính ký tự lạ phía sau (vd "_old", dãy số).
 *
 * @param {string} line Dòng email trong hàng đợi.
 * @return {string|null} Email hợp lệ hoặc null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function normalizeQueueEmail(line) {
  const match = /^\s*([^@\s|:;,]+@[^@\s|:;,]+\.[a-z]{2,})\s*(?:[|:;,\s].*)?$/i.exec(String(line ?? ''));
  return match && isPlausibleGmail(match[1]) ? match[1] : null;
}
export { normalizeQueueEmail };
