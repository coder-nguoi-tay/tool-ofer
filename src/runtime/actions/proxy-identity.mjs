/**
 * Nhận diện duy nhất của một proxy kết hợp cả server và username (dành cho proxy xoay sticky session).
 *
 * @param {object|null} proxy Đối tượng proxy.
 * @return {string} Chuỗi JSON định danh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function proxyIdentity(proxy) {
  return JSON.stringify([proxy?.server ?? '', proxy?.username ?? '']);
}
