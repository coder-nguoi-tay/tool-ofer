import { basePort } from './state/base-port.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Đọc file proxy dạng host:port|user|pass và gán port local cho từng dòng.
 *
 * @param {string} path Đường dẫn file proxy.
 * @return {Promise<object[]>} Danh sách upstream kèm port local.
 * @throws {Error} Khi không có dòng nào hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function readUpstreams(path) {
  const lines = (await readFile(path, 'utf8')).split(/\r?\n/);
  const upstreams = [];
  for (const [index, line] of lines.entries()) {
    const value = line.trim();
    if (!value || value.startsWith('#')) continue;
    const [hostAndPort, username, ...passwordParts] = value.split('|');
    const separator = hostAndPort.lastIndexOf(':');
    const port = Number(hostAndPort.slice(separator + 1));
    const password = passwordParts.join('|');
    if (separator < 1 || !Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Dòng ${index + 1}: cần host:port|user|pass.`);
    }
    if (!username || !password) {
      throw new Error(`Dòng ${index + 1}: thiếu user/pass — relay chỉ dùng cho proxy có xác thực.`);
    }
    upstreams.push({
      host: hostAndPort.slice(0, separator),
      port,
      username,
      password,
      localPort: basePort + upstreams.length
    });
  }
  if (upstreams.length === 0) throw new Error('File proxy không có dòng nào hợp lệ.');
  return upstreams;
}
export { readUpstreams };
