const GOLOGIN_PROFILE_API = 'https://api.gologin.com/browser/custom';
const GOLOGIN_DELETE_API = 'https://api.gologin.com/browser';

/**
 * Chuyển proxy đã mua thành cấu hình proxy của profile GoLogin.
 *
 * @param {{server: string, username?: string, password?: string}|null} proxy Proxy của luồng.
 * @return {object|undefined} Cấu hình proxy hoặc undefined cho kết nối trực tiếp.
 * @throws {Error} Khi giao thức, host hoặc port không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function buildGoLoginProxy(proxy) {
  if (!proxy?.server) return undefined;
  const parsedProxy = new URL(proxy.server);
  const protocol = parsedProxy.protocol.slice(0, -1).toLowerCase();
  const mode = protocol === 'https' ? 'http' : protocol;
  if (!['http', 'socks4', 'socks5'].includes(mode) || !parsedProxy.hostname || !Number(parsedProxy.port)) {
    throw new Error(`Proxy GoLogin không hỗ trợ endpoint: ${proxy.server}`);
  }
  return {
    mode,
    host: parsedProxy.hostname,
    port: Number(parsedProxy.port),
    username: proxy.username || decodeURIComponent(parsedProxy.username),
    password: proxy.password || decodeURIComponent(parsedProxy.password),
  };
}

/**
 * Tạo payload GoLogin cho một profile Mac với proxy và các tùy chọn fingerprint từ giao diện.
 *
 * @param {{slot: number, proxy?: object|null, websiteUrl?: string, antiFingerprint?: object}} options Dữ liệu của luồng.
 * @return {object} Payload hợp lệ cho POST /browser/custom.
 * @throws {Error} Khi proxy không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function buildGoLoginProfileRequest({ slot, proxy = null, websiteUrl = '', antiFingerprint = {} }) {
  const request = {
    name: `AutoLeadPC Mac 2 - Slot ${slot}`,
    os: 'mac',
    autoLang: true,
    timezone: { enabled: true, fillBasedOnIp: true },
    geolocation: { mode: 'allow', enabled: true, fillBasedOnIp: true },
    canvas: { mode: antiFingerprint.canvas ? 'noise' : 'off' },
    clientRects: { mode: antiFingerprint.clientRects ? 'noise' : 'off' },
    webGL: { mode: antiFingerprint.webgl ? 'noise' : 'off' },
    webRTC: { mode: antiFingerprint.webrtc ? 'public' : 'disabled' },
  };
  if (websiteUrl) request.startUrl = websiteUrl;
  const profileProxy = buildGoLoginProxy(proxy);
  if (profileProxy) request.proxy = profileProxy;
  return request;
}

/**
 * Tạo profile trên tài khoản GoLogin để desktop cấp run token hợp lệ cho Orbita.
 *
 * @param {string} token Token API GoLogin của người dùng.
 * @param {object} profileRequest Payload profile đã dựng.
 * @param {typeof fetch} request Giao thức HTTP, có thể thay bằng mock trong test.
 * @return {Promise<string>} ID profile vừa tạo.
 * @throws {Error} Khi token thiếu, API lỗi hoặc phản hồi không có ID.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function createGoLoginProfile(token, profileRequest, request = fetch) {
  if (!token) throw new Error('Thiếu GoLogin API token. Hãy nhập token trong Thiết lập > Browser.');
  const response = await request(GOLOGIN_PROFILE_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(profileRequest),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Không tạo được profile GoLogin (HTTP ${response.status}).`);
  const createdProfile = await response.json();
  const profileId = createdProfile?.id ?? createdProfile?.data?.id;
  if (!profileId) throw new Error('GoLogin đã trả kết quả tạo profile nhưng thiếu ID.');
  return profileId;
}

/**
 * Xóa profile GoLogin do app vừa tạo khi phiên mở thất bại hoặc người dùng chọn dọn sau phiên.
 *
 * @param {string} token API token GoLogin.
 * @param {string} profileId ID profile do app tạo.
 * @param {typeof fetch} request Giao thức HTTP, có thể thay bằng mock trong test.
 * @return {Promise<void>} Hoàn tất khi API xác nhận xóa.
 * @throws {Error} Khi GoLogin từ chối xóa profile.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function deleteGoLoginProfile(token, profileId, request = fetch) {
  const response = await request(GOLOGIN_DELETE_API, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profilesToDelete: [profileId] }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Không xóa được profile GoLogin ${profileId} (HTTP ${response.status}).`);
}
