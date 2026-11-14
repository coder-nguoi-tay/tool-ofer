import { chromeProfileDirectory } from '../chrome-paths.mjs';
import { join } from 'node:path';

/**
 * Profile Chrome riêng theo kênh và phiên bản Chrome thực tế của slot.
 *
 * @param {{channel: string, version: string}} build Bản Chrome được phân bổ cho slot.
 * @param {string} proxyKey Khóa profile gắn với proxy và offer.
 * @return {string} Đường dẫn profile theo kênh/phiên bản Chrome và proxy.
 * @throws {never} Hàm chỉ nối các thành phần đường dẫn hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function browserProfilePath(build, proxyKey) {
  return join(chromeProfileDirectory, build.channel, build.version, proxyKey);
}
