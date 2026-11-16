import { join } from 'node:path';

/**
 * Xác định executable bên trong gói Chrome for Testing đã giải nén.
 * @param {string} directory Thư mục chứa bản Chrome.
 * @param {string} platform Nền tảng trong danh mục Google.
 * @return {string} Đường dẫn executable.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export function chromeBuildExecutable(directory, platform) {
  return platform.startsWith('win') ? join(directory, `chrome-${platform}`, 'chrome.exe') : join(directory, `chrome-${platform}`, 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
}
