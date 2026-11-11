import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

/**
 * Đợi và đọc tệp DevToolsActivePort để trích xuất cổng dynamic và wsUrl (sub_180028180).
 *
 * @param {string} profilePath Đường dẫn thư mục profile trình duyệt.
 * @param {number} timeoutMs Thời gian chờ tối đa (ms).
 * @return {Promise<string>} URL websocket CDP (ws://127.0.0.1:port/...).
 * @throws {Error} Khi quá thời gian chờ mà file DevToolsActivePort chưa xuất hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function waitForDevToolsActivePort(profilePath, timeoutMs = 15000) {
  const portFile = join(profilePath, 'DevToolsActivePort');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(portFile)) {
      try {
        const content = await readFile(portFile, 'utf8');
        const lines = content.trim().split(/\r?\n/);
        if (lines.length >= 2 && lines[0] && lines[1]) {
          return `ws://127.0.0.1:${lines[0]}${lines[1]}`;
        }
      } catch {}
    }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`Quá thời gian ${timeoutMs / 1000}s chờ trình duyệt sinh DevToolsActivePort tại ${profilePath}`);
}
export { waitForDevToolsActivePort };
