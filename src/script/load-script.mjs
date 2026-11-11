import { parseScript } from './parse-script.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Đọc file rồi phân tích thành bước.
 * @param {string} filePath file path.
 * @return {Promise<*>} Kết quả xử lý load script.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadScript(filePath) {
  const text = await readFile(filePath, 'utf8');
  return parseScript(text);
}
export { loadScript };
