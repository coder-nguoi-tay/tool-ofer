import { adsPowerApiKeyPath } from '../constants/ads-power-api-key-path.mjs';
import { appDataDirectory } from '../../config/paths.mjs';
import { chmod } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';

/**
 * Lưu khóa Local API AdsPower chỉ cho tài khoản macOS đang chạy AutoLeadPC.
 *
 * @param {string} apiKey API key từ AdsPower > Automation > API & MCP.
 * @return {Promise<void>} Hoàn tất ghi khóa với quyền 0600.
 * @throws {Error} Khi khóa chứa dòng mới hoặc không thể ghi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function saveAdsPowerApiKey(apiKey) {
  const normalizedKey = String(apiKey ?? '').trim();
  if (/[\r\n]/.test(normalizedKey)) throw new Error('AdsPower API key không hợp lệ.');
  await mkdir(appDataDirectory, {
    recursive: true,
    mode: 0o700
  });
  await writeFile(adsPowerApiKeyPath, normalizedKey, {
    mode: 0o600
  });
  await chmod(adsPowerApiKeyPath, 0o600);
}
