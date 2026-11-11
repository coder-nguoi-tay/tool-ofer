import { ensure711Token } from './ensure711-token.mjs';
import { fetch711Token } from './fetch711-token.mjs';
import { proxy711 } from './state/proxy711.mjs';
import { saveProxy711Config } from './save-proxy711-config.mjs';

/**
 * Thêm IP vào whitelist 711Proxy và làm mới token khi hết hạn.
 * @param {string} ip IP cần cho phép.
 * @param {string|null} token Token truy cập nếu đã có.
 * @param {boolean} retry Cho phép thử lại sau khi làm mới token.
 * @return {Promise<object>} Kết quả xử lý nghiệp vụ.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function add711IpWhitelist(ip, token = null, retry = true) {
  if (!ip) throw new Error('Cần địa chỉ IP để thêm vào whitelist.');
  const curToken = token || (await ensure711Token());
  if (!curToken) {
    throw new Error(`Chưa đăng nhập 711proxy. Vui lòng đăng nhập 711proxy trên app để tự động thêm IP ${ip} vào whitelist.`);
  }
  const res = await fetch('https://server.711proxy.com/eapi/whitelist/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${curToken}`
    },
    body: JSON.stringify({
      whitelist: ip,
      action: 'add'
    })
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (res.ok && (data?.code === 200 || data?.code === 0 || data?.msg === 'success.')) {
    return {
      ok: true,
      ip,
      data
    };
  }
  if (data?.code === 41005 || data?.msg?.includes('flow not enough')) {
    throw new Error('Gói dung lượng 711proxy của tài khoản hiện tại bằng 0 hoặc đã hết hạn (flow not enough). Vui lòng mua/nạp gói GB trên 711proxy rồi bấm lại.');
  }
  if (data?.code === 41010 && retry) {
    proxy711.token = '';
    proxy711.tokenExpiry = 0;
    await saveProxy711Config();
    if (proxy711.username && proxy711.passwd) {
      const freshToken = await fetch711Token(proxy711.username, proxy711.passwd).catch(() => null);
      if (freshToken) {
        return add711IpWhitelist(ip, freshToken, false);
      }
    }
  }
  throw new Error(data?.msg || data?.message || data?.error || `HTTP ${res.status}: ${text.slice(0, 150)}`);
}
export { add711IpWhitelist };
