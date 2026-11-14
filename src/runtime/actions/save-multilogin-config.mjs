import { appDataDirectory } from '../../config/paths.mjs';
import { multiloginConfigPath } from '../constants/multilogin-config-path.mjs';
import { mkdir, writeFile } from 'node:fs/promises';

/**
 * Lưu cấu hình Multilogin (token, folderId, launcherUrl) vào thư mục dữ liệu app.
 *
 * @param {object} config Cấu hình Multilogin cần lưu.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function saveMultiloginConfig(config = {}) {
  await mkdir(appDataDirectory, { recursive: true });
  const data = {
    token: String(config.token || '').trim(),
    folderId: String(config.folderId || '').trim(),
    launcherUrl: String(config.launcherUrl || 'https://launcher.mlx.yt:45001').trim(),
    updatedAt: new Date().toISOString()
  };
  await writeFile(multiloginConfigPath, JSON.stringify(data, null, 2), 'utf8');
}
