import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Liệt kê vị trí Chrome theo từng kênh trên Windows, gồm bản cài riêng cho người dùng.
 * @param {string} [channel='stable'] Kênh Chrome cần tìm.
 * @return {string[]} Các executable theo thứ tự ưu tiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export function windowsChromePaths(channel = 'stable') {
  const product = { stable: 'Chrome', beta: 'Chrome Beta', dev: 'Chrome Dev', canary: 'Chrome SxS' }[channel];
  return [process.env.PROGRAMFILES || 'C:\\Program Files', process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local')].map(root => join(root, 'Google', product, 'Application', 'chrome.exe'));
}
