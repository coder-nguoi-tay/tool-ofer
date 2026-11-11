import { TUNNEL_URL_FILE } from './state/tunnel-url-file.mjs';
import { existsSync } from 'node:fs';
import { moduleState } from './state/module-state.mjs';
import { readFileSync } from 'node:fs';

/**
 * Lấy URL tunnel hiện tại nếu đang hoạt động.
 * @returns {string|null}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getTunnelUrl() {
  if (moduleState.currentTunnelUrl) return moduleState.currentTunnelUrl;
  try {
    if (existsSync(TUNNEL_URL_FILE)) {
      const url = readFileSync(TUNNEL_URL_FILE, 'utf8').trim();
      if (url.startsWith('https://')) return url;
    }
  } catch {}
  return null;
}
export { getTunnelUrl };
