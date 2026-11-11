import { arch } from 'node:os';

/**
 * Chọn tên nền tảng Chrome for Testing theo CPU của máy đang chạy.
 *
 * @return {string} mac-arm64 trên Apple Silicon, mac-x64 trên Intel.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function chromeForTestingPlatform() {
  return arch() === 'arm64' ? 'mac-arm64' : 'mac-x64';
}
export { chromeForTestingPlatform };
