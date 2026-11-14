import { readGoLoginConfig } from './read-gologin-config.mjs';
import { selectGoLoginDevices } from '../../gologin-profile/select-devices.mjs';
import { gologinConfigPath } from '../constants/gologin-config-path.mjs';
import { dirname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

/**
 * Lưu cấu hình GoLogin (token).
 *
 * @param {{token?: string, devices?: string[]}} config Cấu hình token.
 * @return {Promise<void>} Lưu token riêng với quyền file 0600.
 * @throws {Error} Khi không tạo được thư mục hoặc ghi cấu hình.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function saveGoLoginConfig(config = {}) {
  const current = await readGoLoginConfig();
  const payload = {
    ...current,
    token: config.token === undefined ? current.token : String(config.token || '').trim(),
    ...(config.devices !== undefined ? { devices: selectGoLoginDevices({ gologinDevices: config.devices }) } : {}),
    updatedAt: new Date().toISOString()
  };
  await mkdir(dirname(gologinConfigPath), { recursive: true, mode: 0o700 });
  await writeFile(gologinConfigPath, JSON.stringify(payload, null, 2), { encoding: 'utf8', mode: 0o600 });
}
