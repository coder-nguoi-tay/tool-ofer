import { join } from 'node:path';
import { randInt } from './rand-int.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Đọc một dòng ngẫu nhiên từ file text.
 * @param {string} filename filename.
 * @param {string} scriptDir script dir.
 * @return {Promise<*>} Kết quả xử lý random text file.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function randomTextFile(filename, scriptDir = '') {
  const candidates = [join(scriptDir, filename), join(process.cwd(), 'Text', filename), join(process.env.HOME ?? '', 'Downloads', 'AutoLeadPC', 'Text', filename), join(process.env.HOME ?? '', 'Downloads', 'AutoLeadPC', 'Config', filename)];
  for (const p of candidates) {
    try {
      const lines = (await readFile(p, 'utf8')).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length) return lines[randInt(0, lines.length - 1)];
    } catch {}
  }
  return '';
}
export { randomTextFile };
