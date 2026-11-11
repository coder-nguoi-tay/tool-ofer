import { binaryInfo } from 'cloakbrowser';
import { existsSync } from 'node:fs';

/**
 * Lấy chi tiết trạng thái của CloakBrowser (phiên bản, đường dẫn binary, nền tảng).
 *
 * @return {{version: string|null, platform: string|null, binaryPath: string|null, installed: boolean, tier: string|null, error?: string}}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getCloakBrowserStatus() {
  try {
    const info = binaryInfo();
    return {
      version: info?.version ?? null,
      bundledVersion: info?.bundledVersion ?? null,
      platform: info?.platform ?? process.platform,
      binaryPath: info?.binaryPath ?? null,
      installed: Boolean(info?.installed && info?.binaryPath && existsSync(info.binaryPath)),
      tier: info?.tier ?? 'free'
    };
  } catch (err) {
    return {
      version: null,
      bundledVersion: null,
      platform: process.platform,
      binaryPath: null,
      installed: false,
      tier: 'free',
      error: err.message
    };
  }
}
export { getCloakBrowserStatus };
