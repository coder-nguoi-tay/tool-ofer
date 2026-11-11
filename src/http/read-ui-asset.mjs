import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
const bundles = JSON.parse(readFileSync(new URL('../../ui/bundles.json', import.meta.url), 'utf8'));

/**
 * Ghép các file nguồn nhỏ thành một tài nguyên để giao diện chỉ tải một JS và một CSS.
 * @param {string} name Đường dẫn tài nguyên đã được xác thực trong manifest.
 * @return {Promise<string>} Nội dung nguồn theo đúng thứ tự của bundle.
 * @throws {Error} Khi file nguồn không đọc được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function readUiAsset(name) {
  const parts = bundles[name] || [name];
  const contents = [];
  for (const part of parts) {
    contents.push(await readFile(new URL(`../../ui/${part}`, import.meta.url), 'utf8'));
  }
  return contents.join(name.endsWith('.js') ? '\n;\n' : '\n');
}
