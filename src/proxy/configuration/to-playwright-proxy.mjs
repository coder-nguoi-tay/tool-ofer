import { withCredentials } from './with-credentials.mjs';

/**
 * Lọc cấu hình proxy để chỉ truyền các trường Playwright hỗ trợ.
 * @param {object} proxy Proxy đã phân tích.
 * @return {object} Cấu hình kết nối Playwright.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function toPlaywrightProxy({
  server,
  username,
  password
}) {
  return withCredentials(server, username, password);
}
export { toPlaywrightProxy };
