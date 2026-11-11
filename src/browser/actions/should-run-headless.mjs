/**
 * Quyết định trình duyệt có chạy ẩn hoàn toàn (headless) hay không.
 *
 * "Chạy trong app" BẬT → chạy headless, người dùng xem qua tab Xem màn hình.
 * TẮT → cửa sổ Chrome/SunBrowser thật mở ra Desktop.
 * "Ẩn đến trang đích" và "Ẩn tới khi có lead" cũng bắt buộc phải chạy ẩn.
 *
 * @param {{screenPreviewOnly?: boolean, hideUntilTarget?: boolean, hideUntilLead?: boolean}} options Các cờ điều khiển chế độ hiển thị.
 * @return {boolean} True khi phải chạy ẩn hoàn toàn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function shouldRunHeadless({
  screenPreviewOnly = true,
  hideUntilTarget = false,
  hideUntilLead = false
} = {}) {
  return Boolean(screenPreviewOnly) || Boolean(hideUntilTarget) || Boolean(hideUntilLead);
}
