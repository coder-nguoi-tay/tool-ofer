import { adsPowerApiKeyPath } from '../constants/ads-power-api-key-path.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Đọc khóa Local API AdsPower dùng cho profile SunBrowser của các slot.
 *
 * @return {Promise<string>} API key đã lưu hoặc chuỗi rỗng.
 * @throws {Error} Khi file khóa tồn tại nhưng không thể đọc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function readAdsPowerApiKey() {
  try {
    return (await readFile(adsPowerApiKeyPath, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return '';
  }
}
