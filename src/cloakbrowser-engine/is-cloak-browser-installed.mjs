import { binaryInfo } from 'cloakbrowser';
import { existsSync } from 'node:fs';

/**
 * Kiểm tra xem binary CloakBrowser đã được tải và sẵn sàng sử dụng hay chưa.
 *
 * @return {boolean} True nếu binary đã có trên máy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function isCloakBrowserInstalled() {
  try {
    const info = binaryInfo();
    return Boolean(info?.installed && info?.binaryPath && existsSync(info.binaryPath));
  } catch {
    return false;
  }
}
export { isCloakBrowserInstalled };
