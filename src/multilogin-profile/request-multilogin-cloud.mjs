import { DEFAULT_CLOUD_API_ADDRESS } from './state/launcher-address.mjs';

/**
 * Gửi yêu cầu tới Multilogin Cloud API (https://api.multilogin.com).
 *
 * @param {string} token API Bearer token của tài khoản Multilogin.
 * @param {string} path Đường dẫn API (ví dụ: /api/v2/profile).
 * @param {object} [options] Tùy chọn HTTP (method, body, baseUrl).
 * @param {typeof fetch} [request=fetch] Hàm fetch để gửi request hoặc mock test.
 * @return {Promise<object>} Dữ liệu trả về từ Multilogin Cloud.
 * @throws {Error} Khi thiếu token hoặc API trả mã lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function requestMultiloginCloud(token, path, {
  method = 'GET',
  body = null,
  baseUrl = DEFAULT_CLOUD_API_ADDRESS
} = {}, request = fetch) {
  if (!token) throw new Error('Cần cung cấp Multilogin Token để gọi Cloud API.');
  const url = path.startsWith('http') ? path : `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${token}`
  };
  const fetchOptions = {
    method,
    headers,
    signal: AbortSignal.timeout(15000)
  };
  if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(body);
  }
  const response = await request(url, fetchOptions);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const msg = result.message || result.msg || result.error || `HTTP ${response.status}`;
    throw new Error(`Multilogin Cloud API lỗi: ${msg}`);
  }
  return result.data ?? result;
}
