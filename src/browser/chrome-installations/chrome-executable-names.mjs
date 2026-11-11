/**
 * Các tên binary có thể có trong Contents/MacOS của một bản Chrome.
 *
 * Kênh Beta/Dev/Canary mang tên kênh trong tên binary; bản stable và bản lưu theo số phiên
 * bản dùng tên trơn, còn bản tải từ Chrome for Testing dùng tên riêng nên phải thử cả hai.
 *
 * @param {string} channel Tên kênh, hoặc số phiên bản với bản lưu theo version.
 * @return {string[]} Các tên binary cần thử, theo thứ tự ưu tiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function chromeExecutableNames(channel) {
  if (channel === 'stable' || /^\d+(?:\.\d+){0,3}$/.test(channel)) {
    return ['Google Chrome', 'Google Chrome for Testing'];
  }
  return [`Google Chrome ${channel[0].toUpperCase()}${channel.slice(1)}`];
}
export { chromeExecutableNames };
