import { constants } from 'node:fs';
import { access, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const LOCAL_API_ADDRESS = 'http://127.0.0.1:50325';

/**
 * Liệt kê các bản SunBrowser đã cài hoàn chỉnh theo thứ tự mới đến cũ.
 *
 * @param {string} installationDirectory Thư mục các kernel AdsPower trên macOS.
 * @return {Promise<string[]>} Các phiên bản Chrome có binary chạy được.
 * @throws {Error} Khi AdsPower chưa tải xong bất kỳ kernel SunBrowser nào.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
export async function listInstalledAdsPowerKernelVersions(installationDirectory = join(homedir(), 'Library', 'Application Support', 'adspower_global', 'cwd_global')) {
  const installations = await readdir(installationDirectory).catch(() => []);
  const versions = installations.map((name) => /^chrome_(\d+)$/.exec(name)).filter(Boolean)
    .map((match) => Number(match[1])).sort((left, right) => right - left);
  const installedVersions = [];
  for (const version of versions) {
    const browserBinary = join(installationDirectory, `chrome_${version}`, 'SunBrowser.app', 'Contents', 'MacOS', 'SunBrowser');
    if (await access(browserBinary, constants.X_OK).then(() => true, () => false)) installedVersions.push(String(version));
  }
  if (installedVersions.length) return installedVersions;
  throw new Error('AdsPower chưa có SunBrowser đã tải xong. Hãy mở AdsPower và tải một bản SunBrowser trước khi chạy.');
}

/**
 * Chọn SunBrowser mới nhất đã cài cho nơi chỉ cần một profile.
 *
 * @param {string} installationDirectory Thư mục các kernel AdsPower trên macOS.
 * @return {Promise<string>} Phiên bản Chrome mới nhất có binary chạy được.
 * @throws {Error} Khi AdsPower chưa tải xong bất kỳ kernel SunBrowser nào.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
export async function findInstalledAdsPowerKernelVersion(installationDirectory) {
  return (await listInstalledAdsPowerKernelVersions(installationDirectory))[0];
}

/**
 * Chia kernel AdsPower như Chrome thường: bỏ bản đang chạy và xoay vòng phần còn lại.
 *
 * @param {string[]} installedVersions Các kernel đã cài theo thứ tự ưu tiên.
 * @param {Set<string>} occupiedVersions Kernel của các phiên đang chạy.
 * @param {number} rotationCount Bộ đếm xoay vòng dùng chung với Chrome thường.
 * @param {number} requestedCount Số slot cần cấp kernel.
 * @return {string[]} Kernel khác nhau cho các slot có thể mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
export function selectAdsPowerKernelVersions(installedVersions, occupiedVersions, rotationCount, requestedCount) {
  const availableVersions = installedVersions.filter((version) => !occupiedVersions.has(version));
  if (availableVersions.length > 1) {
    const rotationOffset = rotationCount % availableVersions.length;
    availableVersions.push(...availableVersions.splice(0, rotationOffset));
  }
  return availableVersions.slice(0, requestedCount);
}

/**
 * Chuyển cấu hình của một slot thành profile SunBrowser có proxy và fingerprint riêng.
 *
 * @param {object} options Proxy, hệ điều hành, bản SunBrowser đã cài và fingerprint của slot.
 * @return {object} Payload tạo profile AdsPower V2.
 * @throws {Error} Khi thiếu kernel đã cài hoặc giao thức proxy không được AdsPower hỗ trợ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
export function buildAdsPowerProfileRequest({ slot, proxy = null, exitIp = '', websiteUrl = '', antiFingerprint = {}, deviceProfile = 'windows', userAgent = '', browserVersion, resolution = '1920x1080' }) {
  if (!browserVersion) throw new Error('Thiếu phiên bản SunBrowser đã cài cho profile AdsPower.');
  const osLabel = ({ windows: 'Windows 11', macos: 'Mac OS X 14', linux: 'Linux', android: 'Android 13' })[deviceProfile] || 'Windows 11';
  const osShort = ({ windows: 'Win 11', macos: 'macOS', linux: 'Linux', android: 'Android' })[deviceProfile] || 'Win 11';

  const fingerprint = {
    browser_kernel_config: { type: 'chrome', version: String(browserVersion) },
    automatic_timezone: '1',
    language_switch: '1',
    location_switch: '1',
    location: antiFingerprint.apiFakeIP ? 'allow' : 'ask',
    webrtc: antiFingerprint.webrtc && proxy?.server ? 'proxy' : 'disabled',
    canvas: antiFingerprint.canvas !== false ? '0' : '1',
    webgl: antiFingerprint.webgl !== false ? '0' : '1',
    webgl_image: antiFingerprint.webgl !== false ? '0' : '1',
    client_rects: antiFingerprint.clientRects !== false ? '0' : '1',
    audio: '0',
    media_devices: '0',
    fonts: antiFingerprint.fonts !== false ? ['all'] : ['default'],
    screen_resolution: resolution ? resolution.replace('x', '_') : '1920_1080',
    device_memory: '8',
    hardware_concurrency: '8',
  };
  if (userAgent) {
    fingerprint.ua = userAgent;
  } else {
    fingerprint.random_ua = {
      ua_browser: ['chrome'],
      ua_version: [String(browserVersion)],
      ua_system_version: [osLabel],
    };
  }

  const userProxyConfig = { proxy_soft: 'no_proxy' };
  let proxyHost = '';
  if (proxy?.server) {
    const address = new URL(proxy.server);
    const protocol = address.protocol.slice(0, -1).toLowerCase();
    if (!['http', 'https', 'socks5'].includes(protocol) || !address.hostname || !address.port) {
      throw new Error(`AdsPower không hỗ trợ proxy ${proxy.server}.`);
    }
    proxyHost = address.hostname;
    Object.assign(userProxyConfig, {
      proxy_soft: 'other',
      proxy_type: protocol,
      proxy_host: address.hostname,
      proxy_port: address.port,
      proxy_user: proxy.username || decodeURIComponent(address.username),
      proxy_password: proxy.password || decodeURIComponent(address.password),
    });
  }
  const resolvedIp = exitIp || proxyHost || (slot ? `Slot ${slot}` : 'AutoLeadPC');
  const payload = {
    name: `Slot ${slot || 1} • [${osShort}] Chrome ${browserVersion} • ${resolvedIp}`,
    remark: `AutoLeadPC • ${osLabel} • Chrome ${browserVersion} • ${resolvedIp}`,
    group_id: '0',
    user_proxy_config: userProxyConfig,
    fingerprint_config: fingerprint,
    ...(websiteUrl ? { tabs: [websiteUrl] } : {}),
  };
  if (proxyHost) {
    payload.ip = exitIp || proxyHost;
  }
  return payload;
}

/**
 * Gửi yêu cầu tới Local API AdsPower và trả dữ liệu khi thao tác thành công.
 *
 * @param {string} apiKey Khóa Local API trong AdsPower.
 * @param {string} path Đường dẫn API V2.
 * @param {object} payload Dữ liệu của thao tác profile.
 * @param {typeof fetch} request Hàm HTTP để thử nghiệm không cần tài khoản thật.
 * @return {Promise<object>} Trường data của phản hồi AdsPower.
 * @throws {Error} Khi thiếu API key, AdsPower chưa chạy hoặc từ chối thao tác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
export async function requestAdsPower(apiKey, path, payload = null, request = fetch) {
  if (!apiKey) throw new Error('Nhập AdsPower API key trong Settings > Browser.');
  let response;
  const isGet = payload === null || payload === undefined;
  try {
    response = await request(`${LOCAL_API_ADDRESS}${path}`, {
      method: isGet ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(isGet ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(isGet ? {} : { body: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (error) {
    throw new Error(`Không kết nối được AdsPower Local API tại ${LOCAL_API_ADDRESS}: ${error.message}`);
  }
  let result = await response.json().catch(() => null);
  if (result?.code === -1 && String(result?.msg).includes('Too many request')) {
    await new Promise((resolve) => setTimeout(resolve, 1100));
    try {
      response = await request(`${LOCAL_API_ADDRESS}${path}`, {
        method: isGet ? 'GET' : 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(isGet ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(isGet ? {} : { body: JSON.stringify(payload) }),
        signal: AbortSignal.timeout(45_000),
      });
      result = await response.json().catch(() => null);
    } catch {
      // ignore retry network error
    }
  }
  if (!response.ok || (result?.code !== 0 && result?.code !== undefined)) {
    throw new Error(`AdsPower ${path} lỗi: ${result?.msg || `HTTP ${response.status}`}`);
  }
  return result.data ?? {};
}

/**
 * Dọn các profile tạm AutoLeadPC mồ côi còn sót trên AdsPower để tránh chạm ngưỡng giới hạn profile.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {Set<string>|string[]} [activeProfileIds] Danh sách ID profile đang hoạt động cần giữ lại.
 * @param {typeof fetch} [request] Hàm HTTP để thử nghiệm.
 * @return {Promise<number>} Số profile tạm đã được xóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
export async function cleanupOrphanedAdsPowerProfiles(apiKey, activeProfileIds = new Set(), request = fetch, keepPoolSize = 0) {
  try {
    const data = await requestAdsPower(apiKey, '/api/v1/user/list?page=1&page_size=100', null, request);
    const list = Array.isArray(data?.list) ? data.list : [];
    const activeSet = activeProfileIds instanceof Set ? activeProfileIds : new Set(activeProfileIds || []);
    const isAutoLeadProfile = (item) => {
      if (!item) return false;
      if (typeof item.remark === 'string' && item.remark.includes('AutoLeadPC')) return true;
      if (typeof item.name === 'string') {
        if (item.name.includes('AutoLeadPC')) return true;
        if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(item.name)) return true;
        if (/^Slot\s+\d+/i.test(item.name)) return true;
      }
      return false;
    };
    const candidates = list.filter((item) => isAutoLeadProfile(item) && !activeSet.has(item.user_id));
    const toDeleteCount = keepPoolSize > 0 ? Math.max(0, candidates.length - keepPoolSize) : candidates.length;
    const toDelete = candidates.slice(0, toDeleteCount).map((item) => item.user_id);
    if (!toDelete.length) return 0;
    await requestAdsPower(apiKey, '/api/v2/browser-profile/delete', { profile_id: toDelete }, request);
    return toDelete.length;
  } catch (error) {
    console.warn(`[AdsPower] Không thể tự động dọn profile tạm mồ côi: ${error.message}`);
    return 0;
  }
}

/**
 * Cập nhật cấu hình proxy và tên cho một profile AdsPower đã có sẵn (không tốn quota tạo mới).
 *
 * @param {string} apiKey Khóa Local API.
 * @param {string} profileId ID profile AdsPower.
 * @param {object} options Các trường cần cập nhật (name, user_proxy_config, tabs).
 * @param {typeof fetch} [request=fetch] Hàm fetch.
 * @return {Promise<object>} Kết quả cập nhật.
 */
export async function updateAdsPowerProfile(apiKey, profileId, options = {}, request = fetch) {
  const payload = {
    user_id: profileId,
    ...(options.name ? { name: options.name } : {}),
    ...(options.user_proxy_config ? { user_proxy_config: options.user_proxy_config } : {}),
    ...(options.tabs ? { tabs: options.tabs } : {}),
  };
  return requestAdsPower(apiKey, '/api/v1/user/update', payload, request);
}

/**
 * Lấy một profile AdsPower nhàn rỗi trong tài khoản để tái sử dụng, hoặc tạo mới nếu chưa có.
 * Giúp tránh triệt để lỗi "Exceeding import daily limit" khi chạy tự bù nhiều phiên liên tục.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {object} profileRequest Payload profile đã dựng.
 * @param {Set<string>} [activeProfileIds=new Set()] Danh sách profile đang chạy.
 * @param {number} [slot=1] Số slot gán profile.
 * @param {typeof fetch} [request=fetch] Hàm fetch.
 * @return {Promise<string>} ID profile (tái sử dụng hoặc tạo mới).
 */
export async function getOrCreateAdsPowerProfile(apiKey, profileRequest, activeProfileIds = new Set(), slot = 1, request = fetch) {
  const activeSet = activeProfileIds instanceof Set ? activeProfileIds : new Set(activeProfileIds || []);
  try {
    const data = await requestAdsPower(apiKey, '/api/v1/user/list?page=1&page_size=100', null, request);
    const list = Array.isArray(data?.list) ? data.list : [];

    // Tìm profile nhàn rỗi (không nằm trong activeProfileIds)
    const idleProfile = list.find((item) => !activeSet.has(item.user_id) && (item.name?.includes(`Slot ${slot}`) || item.name?.includes('Slot') || item.remark?.includes('AutoLeadPC')))
      || list.find((item) => !activeSet.has(item.user_id));

    if (idleProfile) {
      console.log(`[AdsPower] ♻️ Tái sử dụng profile có sẵn ${idleProfile.user_id} (${idleProfile.name || 'Slot ' + slot}) cho Slot ${slot} (tiết kiệm quota API).`);
      try {
        await updateAdsPowerProfile(apiKey, idleProfile.user_id, {
          name: profileRequest.name,
          user_proxy_config: profileRequest.user_proxy_config,
          tabs: profileRequest.tabs,
        }, request);
      } catch (updateErr) {
        console.warn(`[AdsPower] Cập nhật proxy profile ${idleProfile.user_id}: ${updateErr.message}`);
      }
      return idleProfile.user_id;
    }
  } catch (listErr) {
    console.warn(`[AdsPower] Kiểm tra danh sách profile có sẵn: ${listErr.message}`);
  }

  // Nếu không có profile nào rảnh thì mới tạo mới
  return createAdsPowerProfile(apiKey, profileRequest, request);
}

/**
 * Tạo profile AdsPower mới cho một slot và nhận ID để quản lý vòng đời.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {object} profileRequest Payload profile đã dựng.
 * @param {typeof fetch} request Hàm HTTP để thử nghiệm.
 * @return {Promise<string>} ID profile mới.
 * @throws {Error} Khi API không tạo được profile hoặc thiếu ID.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
export async function createAdsPowerProfile(apiKey, profileRequest, request = fetch) {
  let created;
  try {
    created = await requestAdsPower(apiKey, '/api/v2/browser-profile/create', profileRequest, request);
  } catch (error) {
    const errorMsg = String(error.message || '').toLowerCase();
    if (errorMsg.includes('limit') || errorMsg.includes('exceeds')) {
      const cleaned = await cleanupOrphanedAdsPowerProfiles(apiKey, new Set(), request);
      if (cleaned > 0) {
        created = await requestAdsPower(apiKey, '/api/v2/browser-profile/create', profileRequest, request);
      } else {
        throw error;
      }
    } else {
      throw error;
    }
  }
  if (!created?.profile_id) throw new Error('AdsPower tạo profile nhưng không trả profile_id.');
  return created.profile_id;
}

/**
 * Mở SunBrowser của profile và nhận WebSocket CDP cho Playwright.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {string} profileId ID profile cần mở.
 * @param {object|typeof fetch} [options={}] Tùy chọn khởi chạy (launchArgs) hoặc hàm fetch.
 * @param {typeof fetch} [request=fetch] Hàm HTTP để thử nghiệm.
 * @return {Promise<string>} WebSocket CDP của trình duyệt.
 * @throws {Error} Khi AdsPower không trả điểm kết nối CDP.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
export async function startAdsPowerProfile(apiKey, profileId, options = {}, request = fetch) {
  if (typeof options === 'function') {
    request = options;
    options = {};
  }
  const payload = {
    profile_id: profileId,
    last_opened_tabs: '0',
    proxy_detection: '0',
    cdp_mask: '1',
  };
  const launchArgs = Array.isArray(options.launchArgs) ? [...options.launchArgs] : [];
  // Mặc định đưa cửa sổ ra ngoài màn hình (-20000,-20000) và thu nhỏ để không chớp lên Desktop lúc mở
  if (!launchArgs.some((arg) => typeof arg === 'string' && (arg.startsWith('--window-position') || arg.startsWith('--headless')))) {
    launchArgs.push('--window-position=-20000,-20000');
  }
  if (!launchArgs.some((arg) => typeof arg === 'string' && arg.startsWith('--start-minimized'))) {
    launchArgs.push('--start-minimized');
  }
  if (launchArgs.length > 0) {
    payload.launch_args = launchArgs;
  }
  const started = await requestAdsPower(apiKey, '/api/v2/browser-profile/start', payload, request);
  if (!started.ws?.puppeteer) throw new Error('AdsPower mở profile nhưng không trả CDP URL.');
  return started.ws.puppeteer;
}

/**
 * Dừng profile SunBrowser do AutoLeadPC đã mở.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {string} profileId ID profile cần dừng.
 * @param {typeof fetch} request Hàm HTTP để thử nghiệm.
 * @return {Promise<void>} Hoàn tất khi AdsPower xác nhận dừng.
 * @throws {Error} Khi Local API từ chối dừng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
export async function stopAdsPowerProfile(apiKey, profileId, request = fetch) {
  try {
    await requestAdsPower(apiKey, '/api/v2/browser-profile/stop', { profile_id: profileId }, request);
  } catch (error) {
    const msg = String(error.message || '').toLowerCase();
    if (msg.includes('not open') || msg.includes('not running') || msg.includes('not exist')) {
      return;
    }
    throw error;
  }
}

/**
 * Xóa profile tạm sau khi slot đóng để hoàn lại hạn mức profile.
 *
 * @param {string} apiKey Khóa Local API.
 * @param {string} profileId ID profile tạm của AutoLeadPC.
 * @param {typeof fetch} request Hàm HTTP để thử nghiệm.
 * @return {Promise<void>} Hoàn tất khi AdsPower xác nhận xóa.
 * @throws {Error} Khi Local API từ chối xóa profile.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
export async function deleteAdsPowerProfile(apiKey, profileId, request = fetch) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await requestAdsPower(apiKey, '/api/v2/browser-profile/delete', { profile_id: [profileId] }, request);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  }
  throw lastError;
}
