/**
 * Nhận chế độ tạm thời chỉ ghi kết quả mở trang của tiến trình ứng dụng.
 * @return {boolean} True khi đã bật chế độ access.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export function isAccessOnlyLogging() {
  return process.env.AUTOLEADPC_LOG_MODE === 'access';
}
