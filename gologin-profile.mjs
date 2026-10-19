const GOLOGIN_PROFILE_API = 'https://api.gologin.com/browser/custom';
const GOLOGIN_DELETE_API = 'https://api.gologin.com/browser';
const GOLOGIN_LIST_API = 'https://api.gologin.com/browser/v2';
export const GOLOGIN_PROFILE_NAME_PREFIX = 'AutoLeadPC Mac 2 - Slot';

/**
 * Đọc lời giải thích lỗi GoLogin trả trong body (JSON `message`/`error` hoặc text).
 *
 * @param {Response} response Phản hồi lỗi.
 * @return {Promise<string>} Lời giải thích đã rút gọn, rỗng nếu không có.
 */
async function readGoLoginErrorMessage(response) {
  const text = await response.text().catch(() => '');
  if (!text) return '';
  try {
    const body = JSON.parse(text);
    const message = body?.message ?? body?.error ?? body?.errors?.[0]?.message;
    if (message) return String(Array.isArray(message) ? message.join('; ') : message).slice(0, 300);
  } catch {}
  return text.replace(/\s+/g, ' ').trim().slice(0, 300);
}

/**
 * Đếm profile trong tài khoản GoLogin, tách riêng profile do app tạo (theo tên).
 *
 * @param {string} token API token GoLogin.
 * @param {typeof fetch} request Giao thức HTTP, có thể thay bằng mock trong test.
 * @return {Promise<{total: number, created: number}|null>} Số profile, null nếu không đọc được.
 */
export async function countGoLoginProfiles(token, request = fetch) {
  try {
    const response = await request(GOLOGIN_LIST_API, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    const profiles = Array.isArray(body?.profiles) ? body.profiles : [];
    return {
      total: Number(body?.allProfilesCount ?? profiles.length) || profiles.length,
      created: profiles.filter((profile) => String(profile?.name ?? '').startsWith(GOLOGIN_PROFILE_NAME_PREFIX)).length,
    };
  } catch {
    return null;
  }
}

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
    name: `${GOLOGIN_PROFILE_NAME_PREFIX} ${slot}`,
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
  if (!response.ok) {
    const serverMessage = await readGoLoginErrorMessage(response);
    if (response.status === 402) {
      // 402 Payment Required: gói tài khoản không cho tạo thêm (hết hạn/không có quyền API hoặc chạm giới hạn số profile).
      const counts = await countGoLoginProfiles(token, request);
      const countText = counts
        ? ` Tài khoản đang có ${counts.total} profile, trong đó ${counts.created} profile do AutoLeadPC tạo (tên "${GOLOGIN_PROFILE_NAME_PREFIX} …").`
        : '';
      throw new Error(`GoLogin từ chối tạo profile (HTTP 402 - gói tài khoản không cho phép): gói đã hết hạn/không có quyền API, hoặc đã đạt giới hạn số profile của gói.${countText} Xoá bớt profile cũ trong GoLogin hoặc nâng/gia hạn gói rồi thử lại.${serverMessage ? ` GoLogin báo: ${serverMessage}` : ''}`);
    }
    throw new Error(`Không tạo được profile GoLogin (HTTP ${response.status})${serverMessage ? `: ${serverMessage}` : '.'}`);
  }
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
  if (response.ok) return;
  // Endpoint xoá từng profile mà SDK chính thức dùng.
  const singleResponse = await request(`${GOLOGIN_DELETE_API}/${encodeURIComponent(profileId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!singleResponse.ok) {
    const serverMessage = await readGoLoginErrorMessage(singleResponse);
    throw new Error(`Không xóa được profile GoLogin ${profileId} (HTTP ${singleResponse.status})${serverMessage ? `: ${serverMessage}` : '.'}`);
  }
}
