import { arch } from 'node:os';

/**
 * Chọn tên nền tảng Chrome for Testing theo CPU của máy đang chạy.
 *
 * @return {string} Tên nền tảng Chrome for Testing phù hợp máy hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function chromeForTestingPlatform() {
  if (process.platform === 'win32') return 'win64';
  return arch() === 'arm64' ? 'mac-arm64' : 'mac-x64';
}
export { chromeForTestingPlatform };
