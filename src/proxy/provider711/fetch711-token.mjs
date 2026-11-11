import { fetch711WapiToken } from './fetch711-wapi-token.mjs';
import { get711Balance } from './get711-balance.mjs';
import { proxy711 } from './state/proxy711.mjs';
import { saveProxy711Config } from './save-proxy711-config.mjs';

/**
 * Đăng nhập 711Proxy và lưu token truy cập tài khoản.
 * @param {string} username Tài khoản 711Proxy.
 * @param {string} passwd Mật khẩu tài khoản.
 * @return {Promise<string>} Kết quả xử lý nghiệp vụ.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetch711Token(username, passwd) {
  void fetch711WapiToken(username, passwd).catch(() => {});
  for (const endpoint of ['https://server.711proxy.com/eapi/token/', 'https://server.711proxy.com/wapi/token/']) {
    try {
      const res = await fetch(endpoint, {
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
      } catch {
        continue;
      }
      if (data) {
        const rawToken = data?.results?.token || (typeof data?.results === 'string' ? data.results : null) || data?.data?.token;
        if (typeof rawToken === 'string' && rawToken.length > 0) {
          proxy711.username = username;
          proxy711.passwd = passwd;
          proxy711.token = rawToken;
          proxy711.tokenExpiry = Date.now() + 3_600_000;
          await saveProxy711Config();
          void get711Balance(true);
          return proxy711.token;
        }
      }
    } catch {}
  }
  throw new Error('Đăng nhập thất bại. Kiểm tra lại tài khoản 711proxy.');
}
export { fetch711Token };
