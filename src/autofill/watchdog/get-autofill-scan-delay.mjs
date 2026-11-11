/**
 * Giãn lượt quét không tiến triển để tránh lặp toàn bộ form và AI liên tục trên trang đứng.
 * @param {number} noProgressRounds Số lượt liên tiếp không có thao tác được xác minh.
 * @param {boolean} hasInteractable Trang còn control để làm việc.
 * @return {number} Thời gian chờ tối đa 5 giây, sự kiện điều hướng/thử lại được bỏ qua khoảng chờ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function getAutofillScanDelay(noProgressRounds, hasInteractable = true) {
  if (!hasInteractable || noProgressRounds >= 6) return 5000;
  return noProgressRounds >= 3 ? 1500 : 500;
}
