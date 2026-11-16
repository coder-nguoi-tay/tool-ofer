import { appDataDirectory } from '../config/paths.mjs';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

/**
 * Read auto refill settings.
 * @return {Promise<*>} Kết quả xử lý read auto refill settings.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function readAutoRefillSettings() {
  const dir = appDataDirectory;
  // autorefill-settings.json bị xoá khi Stop; last-launch-settings.json giữ cấu hình lần Start gần nhất
  // nên /run vẫn chạy được sau Stop mà không cần mở app bấm Start lại.
  for (const name of ['autorefill-settings.json', 'last-launch-settings.json']) {
    try {
      const raw = JSON.parse(await readFile(join(dir, name), 'utf8'));
      if (raw?.settings) return raw;
    } catch {/* thử file tiếp theo */}
  }
  return null;
}
export { readAutoRefillSettings };
