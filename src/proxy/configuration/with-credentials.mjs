/**
 * Tạo cấu hình proxy kèm thông tin đăng nhập được cung cấp.
 * @param {string} server Địa chỉ proxy.
 * @param {string} username Tên đăng nhập.
 * @param {string} password Mật khẩu.
 * @return {object} Cấu hình proxy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function withCredentials(server, username, password) {
  const proxy = {
    server
  };
  if (username) proxy.username = username;
  if (password) proxy.password = password;
  return proxy;
}
export { withCredentials };
