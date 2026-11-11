import { getAutoLeadPCDir } from "../../config/paths.mjs";
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

/**
 * Đọc bộ User-Agent PC tương ứng với hệ điều hành của profile đang mở.
 *
 * @param {string} deviceProfile Hệ điều hành đã chọn trong Settings.
 * @return {Promise<string[]>} Các User-Agent hợp lệ, rỗng nếu chưa có cấu hình.
 * @throws {Error} Lỗi đọc file được xem như cấu hình chưa tồn tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function readConfiguredUserAgents(deviceProfile) {
  const candidateNames = {
    windows: ['useragents.txt', 'useragent.txt'],
    macos: ['useragentMac.txt', 'useragent Mac.txt', 'useragentsMac.txt'],
    linux: ['useragentLinux.txt', 'useragent Linux.txt'],
    android: ['useragentAndroid.txt', 'useragent Android.txt'],
    ios: ['useragentIphone.txt', 'useragent Iphone.txt'],
    ipad: ['useragentIpad.txt', 'useragent Ipad.txt']
  }[deviceProfile] || [];
  const osToken = {
    windows: /Windows NT/,
    macos: /Macintosh/,
    linux: /X11; Linux/,
    android: /Android/,
    ios: /iPhone/,
    ipad: /iPad/
  }[deviceProfile];
  if (!osToken || candidateNames.length === 0) return [];
  const candidateDirs = [join(getAutoLeadPCDir(), 'Config', 'Browser'), join(process.cwd(), 'Config', 'Browser'), process.cwd()];
  for (const dir of candidateDirs) {
    for (const name of candidateNames) {
      try {
        const content = await readFile(join(dir, name), 'utf8');
        const lines = content.split(/\r?\n/).map(line => line.trim()).filter(line => line.startsWith('Mozilla/') && osToken.test(line));
        if (lines.length > 0) return lines;
      } catch {}
    }
  }
  return [];
}
