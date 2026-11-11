import { chromeProfileDirectory } from '../chrome-paths.mjs';
import { join } from 'node:path';

/**
 * Tách profile CloakBrowser khỏi profile Chrome thường theo phiên bản engine thực tế.
 *
 * @param {{channel: string, version: string}} build Bản Chrome được phân bổ cho slot.
 * @param {string} proxyKey Khóa profile gắn với proxy và offer.
 * @param {string|null} cloakVersion Phiên bản engine CloakBrowser, hoặc null khi dùng Chrome thường.
 * @return {string} Đường dẫn profile độc lập với engine còn lại.
 * @throws {never} Hàm chỉ nối các thành phần đường dẫn hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function browserProfilePath(build, proxyKey, cloakVersion = null) {
  return join(chromeProfileDirectory, cloakVersion !== null ? 'cloakbrowser' : build.channel, cloakVersion ?? build.version, proxyKey);
}
