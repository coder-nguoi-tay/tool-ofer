import { proxy711 } from './state/proxy711.mjs';
import { saveProxy711Config } from './save-proxy711-config.mjs';

/**
 * Đăng nhập dashboard 711Proxy để lấy WAPI token.
 * @param {string} username Tài khoản 711Proxy.
 * @param {string} passwd Mật khẩu tài khoản.
 * @return {Promise<string>} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetch711WapiToken(username, passwd) {
  try {
    const res = await fetch('https://server.711proxy.com/wapi/token/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username,
        passwd
      })
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {}
    const rawToken = data?.results?.token || (typeof data?.results === 'string' ? data.results : null) || data?.data?.token;
    if (typeof rawToken === 'string' && rawToken.length > 0) {
      proxy711.wapiToken = rawToken;
      proxy711.wapiTokenExpiry = Date.now() + 3_600_000;
      await saveProxy711Config();
      return proxy711.wapiToken;
    }
  } catch (err) {
    console.warn('[711WapiToken] Lỗi lấy WAPI token:', err.message);
  }
  return null;
}
export { fetch711WapiToken };
