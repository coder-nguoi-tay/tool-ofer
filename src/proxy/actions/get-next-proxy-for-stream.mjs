import { getNextCollisionFreeProxy } from './get-next-collision-free-proxy.mjs';

/**
 * Lấy proxy tiếp theo cho luồng tương ứng (giữ tương thích hàm getNextProxyForStream cũ).
 *
 * @param {number} streamRole 1 hoặc 2.
 * @param {Array<object>} proxies Danh sách proxy khả dụng.
 * @return {object|null} Proxy được chọn hoặc null nếu không còn proxy phù hợp.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function getNextProxyForStream(streamRole, proxies = []) {
  return getNextCollisionFreeProxy(streamRole, proxies, 2);
}
