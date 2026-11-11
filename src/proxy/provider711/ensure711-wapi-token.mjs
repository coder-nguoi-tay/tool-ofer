import { fetch711WapiToken } from './fetch711-wapi-token.mjs';
import { loadProxy711Config } from './load-proxy711-config.mjs';
import { proxy711 } from './state/proxy711.mjs';

/**
 * Lấy WAPI token còn hạn hoặc đăng nhập lại.
 * @return {Promise<string>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function ensure711WapiToken() {
  if (proxy711.wapiToken && Date.now() < (proxy711.wapiTokenExpiry || 0)) {
    return proxy711.wapiToken;
  }
  if (!proxy711.username || !proxy711.passwd) {
    await loadProxy711Config();
  }
  if (proxy711.username && proxy711.passwd) {
    return await fetch711WapiToken(proxy711.username, proxy711.passwd);
  }
  return null;
}
export { ensure711WapiToken };
