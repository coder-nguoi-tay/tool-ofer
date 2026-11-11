/**
 * Cho phép thử lại các proxy chỉ thất bại vì không xác minh được IP thoát.
 *
 * Bản ghi cũ trước khi có trạng thái `verification_error` được nhận diện qua thông báo
 * của bước IP; các lỗi proxy, website và profile khác tiếp tục bị loại vĩnh viễn.
 *
 * @param {object|undefined} historyRecord Bản ghi lịch sử của proxy.
 * @return {boolean} True nếu proxy chưa được xác minh và có thể thử lại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function isRetryableIpVerificationFailure(historyRecord) {
  if (!historyRecord) return false;
  if (historyRecord.status === 'verification_error') return !historyRecord.exitIp;
  if (historyRecord.status !== 'failed' || historyRecord.exitIp) return false;
  const reason = String(historyRecord.reason ?? '');
  return reason.startsWith('không lấy được IP qua trình duyệt');
}
