/**
 * Relay SOCKS5 thêm xác thực.
 *
 * Playwright chỉ chào method "no auth" nên không dùng được proxy SOCKS5 bắt buộc đăng nhập.
 * Relay này nhận kết nối no-auth từ Playwright, rồi tự chào method 02 với upstream, làm
 * xác thực RFC 1929, và chuyển tiếp nguyên văn yêu cầu CONNECT.
 *
 *   Playwright --no-auth--> 127.0.0.1:1080 --user/pass--> host:port
 *
 * Mỗi dòng trong file proxy được gán một port local riêng, nên map 1 port ↔ 1 IP exit
 * của upstream được giữ nguyên.
 *
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
const basePort = Number(process.env.AUTOLEADPC_RELAY_PORT) || 1080;
export { basePort };
