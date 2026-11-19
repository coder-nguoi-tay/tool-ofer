import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { appDataDirectory } from '../config/paths.mjs';

const directory = join(appDataDirectory, 'form-mcp');
export const pairingLifetime = 10 * 60 * 1000;

/**
 * Cấp mã ghép cho một MCP client của tài khoản hệ điều hành hiện tại.
 * @param {string} origin Origin chính xác của biểu mẫu do người vận hành quản lý.
 * @return {object} Mã nhập trong Screen View, bearer riêng của client và hạn dùng.
 * @throws {Error} Khi origin không hợp lệ hoặc không ghi được file riêng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function issuePairing(origin) {
  const url = new URL(origin);
  const localHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((!localHttp && url.protocol !== 'https:') || origin !== url.origin) {
    throw new Error('Hãy nhập đúng origin HTTPS hoặc HTTP loopback, không kèm đường dẫn.');
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const code = randomUUID();
  const token = randomBytes(32).toString('hex');
  const expiresAt = Date.now() + pairingLifetime;
  const file = join(directory, code);
  writeFileSync(file, JSON.stringify({ origin, token, expiresAt }), { flag: 'wx', mode: 0o600 });
  return { code, token, origin, expiresAt, file };
}

/**
 * Nhận mã một lần khi người vận hành ghép tab, dùng rename để hai request không cùng nhận mã.
 * @param {string} code Mã do MCP client hiển thị.
 * @return {object} Quyền truy cập được ràng buộc vào origin.
 * @throws {Error} Khi mã sai, đã dùng hoặc hết hạn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function consumePairing(code) {
  if (typeof code !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(code)) throw new Error('Mã ghép không hợp lệ.');
  const file = join(directory, code);
  const claimed = file + '.claimed-' + randomUUID();
  try {
    renameSync(file, claimed);
    const pair = JSON.parse(readFileSync(claimed, 'utf8'));
    if (pair.expiresAt > Date.now()) return pair;
  } catch {} finally { rmSync(claimed, { force: true }); }
  throw new Error('Mã ghép đã dùng, hết hạn hoặc thuộc instance khác.');
}
