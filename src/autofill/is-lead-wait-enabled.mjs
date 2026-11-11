/**
 * Chỉ cho phép dừng chờ lead khi cấu hình đã bật; cờ tắt của phiên hoặc lượt quét luôn thắng.
 * @param {object} session Phiên trình duyệt.
 * @param {object} options Cấu hình autofill.
 * @return {boolean} True khi người dùng bật chờ lead.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function isLeadWaitEnabled(session, options = {}) {
  if (session.enableLeadCheck === false || options.enableLeadCheck === false) return false;
  return options.enableLeadCheck === true || session.enableLeadCheck === true;
}
