import { DEFAULT_LAUNCHER_ADDRESS } from './state/launcher-address.mjs';

/**
 * Gửi yêu cầu tới Multilogin Local Launcher agent (mặc định https://launcher.mlx.yt:45001).
 *
 * @param {string|null} token API Bearer token nếu launcher yêu cầu.
 * @param {string} path Đường dẫn API local.
 * @param {object} [options] Tùy chọn HTTP (method, body, launcherUrl).
 * @param {typeof fetch} [request=fetch] Hàm fetch để gửi request hoặc mock test.
 * @return {Promise<object>} Dữ liệu JSON trả về từ launcher.
 * @throws {Error} Khi không kết nối được tới launcher hoặc launcher báo lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
export async function requestMultiloginLauncher(token, path, {
  method = 'GET',
  body = null,
  launcherUrl = DEFAULT_LAUNCHER_ADDRESS
} = {}, request = fetch) {
  const url = path.startsWith('http') ? path : `${launcherUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = {
    Accept: 'application/json'
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const fetchOptions = {
    method,
    headers,
    signal: AbortSignal.timeout(20000)
  };
  if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
    headers['Content-Type'] = 'application/json';
    fetchOptions.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await request(url, fetchOptions);
  } catch (err) {
    throw new Error(`Không thể kết nối Multilogin Launcher tại ${launcherUrl}: ${err.message}. Hãy chắc chắn ứng dụng Multilogin đang chạy.`);
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 200) {
    const msg = result.message || result.msg || result.error || `HTTP ${response.status}`;
    throw new Error(`Multilogin Launcher lỗi: ${msg}`);
  }
  return result;
}
