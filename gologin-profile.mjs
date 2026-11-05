const GOLOGIN_PROFILE_API = 'https://api.gologin.com/browser/custom';
const GOLOGIN_DELETE_API = 'https://api.gologin.com/browser';
const GOLOGIN_BOOKMARKS_API = 'https://api.gologin.com/browser/bookmarks/many';
const FONT_FAMILIES_BY_OS = {
  windows: ['Arial', 'Calibri', 'Cambria', 'Consolas', 'Courier New', 'Georgia', 'Segoe UI', 'Tahoma', 'Times New Roman', 'Verdana'],
  macos: ['Arial', 'Arial Black', 'Avenir', 'Courier New', 'Georgia', 'Helvetica', 'Menlo', 'Times New Roman', 'Trebuchet MS', 'Verdana'],
  linux: ['Arial', 'DejaVu Sans', 'DejaVu Serif', 'Liberation Sans', 'Liberation Serif', 'Noto Sans', 'Ubuntu', 'Verdana'],
  android: ['Arial', 'Droid Sans', 'Noto Sans', 'Roboto', 'sans-serif', 'serif', 'monospace'],
};

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
 * Tạo payload GoLogin cho profile có hệ điều hành, proxy và fingerprint từ giao diện.
 *
 * @param {{slot: number, proxy?: object|null, websiteUrl?: string, antiFingerprint?: object, deviceProfile?: string, userAgent?: string, resolution?: string}} options Dữ liệu luồng, hệ điều hành và navigator.
 * @return {object} Payload hợp lệ cho POST /browser/custom.
 * @throws {Error} Khi proxy không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function buildGoLoginProfileRequest({ slot, proxy = null, websiteUrl = '', antiFingerprint = {}, deviceProfile = 'macos', userAgent = '', resolution = '1920x1080' }) {
  const operatingSystem = ({ windows: 'win', macos: 'mac', linux: 'lin', android: 'android' })[deviceProfile] ?? 'mac';
  const request = {
    name: `AutoLeadPC Mac 2 - Slot ${slot}`,
    os: operatingSystem,
    autoLang: true,
    timezone: { enabled: true, fillBasedOnIp: true },
    geolocation: antiFingerprint.apiFakeIP
      ? { mode: 'allow', enabled: true, fillBasedOnIp: true }
      : { mode: 'prompt', enabled: false, fillBasedOnIp: false },
    canvas: { mode: antiFingerprint.canvas ? 'noise' : 'off' },
    clientRects: { mode: antiFingerprint.clientRects ? 'noise' : 'off' },
    webGL: { mode: antiFingerprint.webgl ? 'noise' : 'off' },
    webRTC: { mode: antiFingerprint.webrtc ? 'public' : 'disabled' },
  };
  if (userAgent) {
    const platform = ({ windows: 'Win32', macos: 'MacIntel', linux: 'Linux x86_64', android: 'Linux armv8l' })[deviceProfile] ?? 'MacIntel';
    request.navigator = { userAgent, resolution, language: 'en-US,en', platform };
  }
  if (antiFingerprint.fonts) {
    request.fonts = {
      families: FONT_FAMILIES_BY_OS[deviceProfile] ?? FONT_FAMILIES_BY_OS.macos,
      enableMasking: true,
      enableDomRect: true,
    };
  }
  if (websiteUrl) request.startUrl = websiteUrl;
  const profileProxy = buildGoLoginProxy(proxy);
  if (profileProxy) request.proxy = profileProxy;
  return request;
}

/**
 * Chuyển các dòng bookmark theo định dạng PC thành cây thư mục GoLogin.
 *
 * @param {string} bookmarkText Nội dung bookmarks.txt.
 * @return {object|null} Cấu trúc bookmark_bar/other/synced hoặc null nếu không có dòng hợp lệ.
 * @throws {Error} Không ném lỗi; dòng sai định dạng được bỏ qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function parseGoLoginBookmarks(bookmarkText) {
  const root = { name: 'Bookmarks bar', type: 'folder', children: [] };
  const folders = new Map();
  for (const line of String(bookmarkText ?? '').split(/\r?\n/)) {
    const parts = line.trim().split('::');
    if (parts.length === 3) {
      const [folderName, title, url] = parts.map((part) => part.trim());
      if (!folderName || !title || !/^https?:\/\//i.test(url)) continue;
      let folder = folders.get(folderName);
      if (!folder) {
        folder = { name: folderName, type: 'folder', children: [] };
        folders.set(folderName, folder);
        root.children.push(folder);
      }
      folder.children.push({ name: title, type: 'url', url });
    } else {
      const [title, url] = parts.length === 2 ? parts.map((part) => part.trim()) : ['', parts[0]?.trim()];
      if (!/^https?:\/\//i.test(url)) continue;
      root.children.push({ name: title || url, type: 'url', url });
    }
  }
  if (!root.children.length) return null;
  return { bookmark_bar: root, other: { name: 'Other bookmarks', type: 'folder', children: [] }, synced: { name: 'Mobile bookmarks', type: 'folder', children: [] } };
}

/**
 * Ghi bookmarks vào profile vừa tạo trước khi GoLogin Desktop khởi chạy Orbita.
 *
 * @param {string} token API token GoLogin.
 * @param {string} profileId ID profile nhận bookmarks.
 * @param {object} bookmarks Cây bookmark đã chuẩn hóa.
 * @param {typeof fetch} request Giao thức HTTP, có thể thay bằng mock trong test.
 * @return {Promise<void>} Hoàn tất khi API xác nhận cập nhật.
 * @throws {Error} Khi API từ chối cập nhật bookmarks.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function updateGoLoginProfileBookmarks(token, profileId, bookmarks, request = fetch) {
  const response = await request(GOLOGIN_BOOKMARKS_API, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileIds: [profileId], bookmarks }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Không cập nhật được bookmarks GoLogin (HTTP ${response.status}).`);
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
    const responseText = await response.text().catch(() => '');
    let responseMessage = responseText.trim();
    try {
      const responseBody = JSON.parse(responseMessage);
      responseMessage = responseBody.message ?? responseBody.error ?? responseMessage;
    } catch {}
    if (response.status === 403 && /free API requests limit/i.test(responseMessage)) {
      responseMessage = 'Tài khoản đã hết hạn mức API miễn phí. Hãy nâng cấp gói hoặc liên hệ GoLogin để tiếp tục.';
    }
    const detail = responseMessage ? `: ${String(responseMessage).slice(0, 400)}` : '';
    throw new Error(`Không tạo được profile GoLogin (HTTP ${response.status})${detail}`);
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
  if (!response.ok) throw new Error(`Không xóa được profile GoLogin ${profileId} (HTTP ${response.status}).`);
}
