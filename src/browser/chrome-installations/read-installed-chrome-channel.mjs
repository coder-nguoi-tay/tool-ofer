import { access } from 'node:fs/promises';
import { chromeExecutableNames } from './chrome-executable-names.mjs';
import { executeFile } from './state/execute-file.mjs';
import { join } from 'node:path';

/**
 * Đọc binary và phiên bản của một kênh Google Chrome đã cài trên macOS.
 *
 * @param {string} appPath Đường dẫn ứng dụng của kênh Chrome.
 * @param {string} channel Tên kênh để gắn với phiên mở.
 * @return {Promise<{executablePath: string, version: string, major: number, channel: string}>} Kênh Chrome đang cài.
 * @throws {Error} Khi không tìm thấy binary hoặc phiên bản không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function readInstalledChromeChannel(appPath, channel) {
  const executableNames = chromeExecutableNames(channel);
  let executablePath;
  for (const executableName of executableNames) {
    const candidatePath = join(appPath, 'Contents', 'MacOS', executableName);
    try {
      await access(candidatePath);
      executablePath = candidatePath;
      break;
    } catch {
      // Tên còn lại sẽ được thử; không tìm thấy tên nào thì báo lỗi bên dưới.
    }
  }
  if (!executablePath) {
    throw new Error(`Không tìm thấy binary Chrome trong ${appPath}.`);
  }
  // Chrome for Testing được phép dùng trong vòng xoay (xem listInstalledChromeChannels):
  // là binary Chrome chính thức của Google, engine/UA/Sec-CH-UA cùng phiên bản, chỉ
  // khác tên bundle. Chỉ nhận major ≥ 150 để profile mẫu RoboForm chép được sang.
  const infoPath = join(appPath, 'Contents', 'Info.plist');
  const {
    stdout
  } = await executeFile('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', infoPath]);
  const version = stdout.trim();
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Phiên bản Google Chrome ${channel} không hợp lệ: ${version}.`);
  }
  return {
    executablePath,
    version,
    major: Number(version.split('.')[0]),
    channel
  };
}
export { readInstalledChromeChannel };
