import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Tìm executable trình duyệt Chrome/Chromium có sẵn trên macOS.
 *
 * @return {string|null} Đường dẫn thực thi hoặc null nếu không có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function resolveBrowserExecutable() {
  const candidates = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', '/Applications/Chromium.app/Contents/MacOS/Chromium', join(homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')];
  for (const bin of candidates) {
    if (existsSync(bin)) return bin;
  }
  return null;
}
export { resolveBrowserExecutable };
