import { gologinConfigPath } from '../constants/gologin-config-path.mjs';
import { readFile } from 'node:fs/promises';

/**
 * Đọc token GoLogin do người dùng cấu hình, không dùng token dự phòng trong source.
 * @return {Promise<{token: string, devices?: string[]}>} Token rỗng khi chưa có cấu hình.
 * @throws {Error} Khi file cấu hình hỏng hoặc không thể đọc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function readGoLoginConfig() {
  try {
    const config = JSON.parse(await readFile(gologinConfigPath, 'utf8'));
    return { token: String(config.token || '').trim(), ...(config.devices ? { devices: config.devices } : {}) };
  } catch (error) {
    if (error.code === 'ENOENT') return { token: '' };
    throw new Error('Không đọc được cấu hình GoLogin; kiểm tra lại file cấu hình.');
  }
}
