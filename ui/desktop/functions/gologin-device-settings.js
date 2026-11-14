/**
 * Đọc các loại profile chính thức được chọn riêng cho GoLogin.
 * @return {string[]} Khóa profile theo thứ tự hiển thị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function getGoLoginDeviceChoices() {
  return Array.from(document.querySelectorAll('[data-gologin-device]:checked')).map(input => input.dataset.gologinDevice);
}

/**
 * Khôi phục lựa chọn GoLogin đã lưu mà không thay đổi các thiết bị của Chrome.
 * @param {string[]} devices Các khóa profile đã lưu.
 * @return {void} Cập nhật checkbox trong Cài đặt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function applyGoLoginDeviceChoices(devices) {
  const selected = new Set(devices || ['windows', 'windows11', 'macos-intel', 'macos-arm', 'linux', 'android']);
  document.querySelectorAll('[data-gologin-device]').forEach(input => {
    input.checked = selected.has(input.dataset.gologinDevice);
  });
}
