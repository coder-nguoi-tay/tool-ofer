import { fetch711Token } from './fetch711-token.mjs';
import { loadProxy711Config } from './load-proxy711-config.mjs';
import { proxy711 } from './state/proxy711.mjs';

/**
 * Lấy token 711Proxy còn hạn hoặc đăng nhập lại.
 * @return {Promise<string>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function ensure711Token() {
  if (proxy711.token && Date.now() < proxy711.tokenExpiry) {
    return proxy711.token;
  }
  if (!proxy711.username || !proxy711.passwd) {
    await loadProxy711Config();
  }
  if (proxy711.username && proxy711.passwd) {
    try {
      return await fetch711Token(proxy711.username, proxy711.passwd);
    } catch {}
  }
  return null;
}
export { ensure711Token };
