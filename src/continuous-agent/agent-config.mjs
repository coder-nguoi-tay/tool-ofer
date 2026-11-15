import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appDataDirectory } from '../config/paths.mjs';
import { API_FORMATS } from './api-chat-session.mjs';

const DEFAULTS = { transport: 'agy', apiFormat: 'openai', apiBaseUrl: '', apiKey: '', apiModel: '' };

/**
 * File cấu hình riêng của agent (tách khỏi ai-config.json vì route đó trả nguyên file và bị UI ghi đè cả file).
 * @return {string} Đường dẫn trong thư mục dữ liệu của instance hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export const getAgentConfigPath = () => join(appDataDirectory, 'Config', 'agent-config.json');

/**
 * Nạp cấu hình agent; biến môi trường AUTOLEAD_AGENT_API_URL/KEY/MODEL ghi đè file.
 * @param {string} [filePath] Đường dẫn file (test).
 * @param {object} [env=process.env] Biến môi trường (test).
 * @return {{transport:string,apiBaseUrl:string,apiKey:string,apiModel:string}} Cấu hình đầy đủ (có key).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function loadAgentConfig(filePath = getAgentConfigPath(), env = process.env) {
  let saved = {};
  try { if (existsSync(filePath)) saved = JSON.parse(readFileSync(filePath, 'utf8')); } catch {}
  const config = { ...DEFAULTS, ...Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, saved[key]]).filter(([, value]) => typeof value === 'string')) };
  if (env.AUTOLEAD_AGENT_API_FORMAT) config.apiFormat = env.AUTOLEAD_AGENT_API_FORMAT;
  if (env.AUTOLEAD_AGENT_API_URL) config.apiBaseUrl = env.AUTOLEAD_AGENT_API_URL;
  if (env.AUTOLEAD_AGENT_API_KEY) config.apiKey = env.AUTOLEAD_AGENT_API_KEY;
  if (env.AUTOLEAD_AGENT_API_MODEL) config.apiModel = env.AUTOLEAD_AGENT_API_MODEL;
  return config;
}

/**
 * Lưu cập nhật từng phần: key rỗng/thiếu thì giữ key cũ, `clearApiKey:true` mới xóa. File chmod 600.
 * @param {object} patch Các trường cần đổi.
 * @param {string} [filePath] Đường dẫn file (test).
 * @return {object} Cấu hình đã lưu (có key; không trả ra ngoài API).
 * @throws {Error} Khi transport không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function saveAgentConfig(patch = {}, filePath = getAgentConfigPath()) {
  let current = {};
  try { if (existsSync(filePath)) current = { ...DEFAULTS, ...JSON.parse(readFileSync(filePath, 'utf8')) }; } catch {}
  const next = { ...DEFAULTS, ...current };
  if (patch.transport !== undefined) {
    if (!['agy', 'api'].includes(patch.transport)) throw new Error('transport phải là "agy" hoặc "api"');
    next.transport = patch.transport;
  }
  if (patch.apiFormat !== undefined) {
    if (!API_FORMATS.includes(patch.apiFormat)) throw new Error(`apiFormat phải là một trong: ${API_FORMATS.join(', ')}`);
    next.apiFormat = patch.apiFormat;
  }
  for (const key of ['apiBaseUrl', 'apiModel']) if (typeof patch[key] === 'string') next[key] = patch[key].trim();
  if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) next.apiKey = patch.apiKey.trim();
  if (patch.clearApiKey === true) next.apiKey = '';
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
  try { chmodSync(filePath, 0o600); } catch {}
  return next;
}

/**
 * Bản an toàn để trả cho UI/log: không bao giờ chứa key.
 * @param {object} config Cấu hình đầy đủ.
 * @return {object} transport, apiBaseUrl, apiModel, apiKeySet, apiKeyHint (4 ký tự cuối).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function maskAgentConfig(config) {
  const { transport, apiFormat, apiBaseUrl, apiModel, apiKey } = config;
  return { transport, apiFormat, apiBaseUrl, apiModel, apiKeySet: Boolean(apiKey), apiKeyHint: apiKey ? `…${apiKey.slice(-4)}` : '' };
}
