import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { installedChromeAppPath } from '../browser/chrome-paths.mjs';

/**
 * Tìm executable trình duyệt Chrome/Chromium có sẵn trên hệ điều hành hiện tại.
 *
 * @return {string|null} Đường dẫn thực thi hoặc null nếu không có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function resolveBrowserExecutable() {
  const candidates = process.platform === 'win32' ? [installedChromeAppPath] : ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', '/Applications/Chromium.app/Contents/MacOS/Chromium', join(homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')];
  for (const bin of candidates) {
    if (existsSync(bin)) return bin;
  }
  return null;
}
export { resolveBrowserExecutable };
