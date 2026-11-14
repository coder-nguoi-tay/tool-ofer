import { multiloginConfigPath } from '../constants/multilogin-config-path.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Đọc cấu hình Multilogin (token, folderId, launcherUrl).
 *
 * @return {Promise<{token: string, folderId: string, launcherUrl: string}>} Cấu hình Multilogin.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function readMultiloginConfig() {
  try {
    const raw = await readFile(multiloginConfigPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      token: String(parsed.token || '').trim(),
      folderId: String(parsed.folderId || '').trim(),
      launcherUrl: String(parsed.launcherUrl || 'https://launcher.mlx.yt:45001').trim()
    };
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn(`[Multilogin] Lỗi đọc cấu hình: ${error.message}`);
    return {
      token: '',
      folderId: '',
      launcherUrl: 'https://launcher.mlx.yt:45001'
    };
  }
}
