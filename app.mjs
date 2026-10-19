import { createServer, get as requestHttp } from 'node:http';
import { createConnection as netCreateConnection } from 'node:net';
import { get as requestHttps } from 'node:https';
import { access, cp, mkdir, readFile, readdir, readlink, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { homedir, hostname as getHostname, cpus } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import {
  installChromeVersions,
} from './chrome-versions.mjs';
import { startAuthenticatedHttpRelay, startAuthenticatedSocksRelay } from './relay.mjs';
import { buildGoLoginProfileRequest, createGoLoginProfile, deleteGoLoginProfile } from './gologin-profile.mjs';
import {
  cleanupLocalProfile,
  prepareLocalZeroProfile,
  resolveBrowserExecutable,
  spawnLocalProfileBrowser,
  stopLocalProfileBrowser,
} from './local-profile-engine.mjs';
import {
  applyNativeOverrides, buildStealthConfig, buildUserAgentOverride, createDeviceVariant, localeForCountry, stealthInitScript,
} from './stealth.mjs';
import { attachAutofill, parseAutofillRecords } from './autofill.mjs';
import { runAiAssist, pageHasWork, globalAiConfig, setGlobalAiConfig } from './ai-assist.mjs';
import { startTelegramBot, tgNotify } from './tgbot.mjs';

export function getAiConfigFilePath() {
  return join(getAutoLeadPCDir(), 'Config', 'ai-config.json');
}

export function loadAiConfig() {
  try {
    const filePath = getAiConfigFilePath();
    if (existsSync(filePath)) {
      const data = JSON.parse(readFileSync(filePath, 'utf8'));
      setGlobalAiConfig(data);
      return data;
    }
  } catch {}
  return globalAiConfig;
}

export function saveAiConfigFile(cfg) {
  try {
    const filePath = getAiConfigFilePath();
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    setGlobalAiConfig(cfg);
    writeFileSync(filePath, JSON.stringify(cfg, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
import { loadScript, runScript } from './script.mjs';
import {
  DEFAULT_LEAD_CONFIG,
  fetchLeadDatas,
  fetchCurrentPoint,
  fetchToffersOverview,
  updateLeadConfig,
  isLeadPresent,
  normalizeIpAddress,
  LeadApiError,
  leadIpStatsMap,
  recordLeadIpStats,
  getLeadIpStats,
  initLeadIpStats,
  clearLeadIpStats,
} from './lead-check.mjs';

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Process] Unhandled rejection:', reason);
});

const executeFile = promisify(execFile);
const activeBrowsers = new Set();
// slot → { cdpClient, sseResponse, intervalId }
const screencastSessions = new Map();
let chromeBuildRotationCounter = 0;
let deviceProfileRotationCounter = 0;
// limitRun: đếm số phiên hoàn tất (completeText khớp), dừng mở thêm khi đạt giới hạn (0 = không giới hạn)
let limitRunCount = 0;
let limitRunMax = 0;

/** @type {Map<object, Array<{time:string,type:string,[key:string]:any}>>} */
// Giới hạn WebGL của GPU desktop thật (SwiftShader khi chạy headless chỉ báo 8192).
const desktopWebglParams = { 3379: 16384, 34024: 16384, 3386: [32767, 32767] }; // MAX_TEXTURE_SIZE, MAX_RENDERBUFFER_SIZE, MAX_VIEWPORT_DIMS

/**
 * Thiết bị giả lập. UA mang số phiên bản đầy đủ của bản Chrome đang mở (mỗi cửa sổ một phiên bản riêng),
 * khớp với fullVersionList trong Client Hints. Chuỗi GPU theo đúng định dạng ANGLE mà Chrome trên từng hệ điều hành trả.
 */
export const DEVICE_PROFILES = {
  windows: {
    label: 'Windows Desktop',
    ua: (v) => `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
    viewport: null, isMobile: false, hasTouch: false, deviceScaleFactor: 1,
    screen: { width: 1920, height: 1080, availHeight: 1032, frameHeight: 87 },
    uaData: { platform: 'Windows', platformVersion: '15.0.0', architecture: 'x86', bitness: '64', model: '' },
    spoof: {
      platform: 'Win32', maxTouchPoints: 0, mobile: false, uaPlatform: 'Windows', dpr: 1, vendor: 'Google Inc.',
      hardwareConcurrency: 8, deviceMemory: 8,
      webglVendor: 'Google Inc. (NVIDIA)',
      webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)',
      webglParams: desktopWebglParams,
    },
  },
  macos: {
    label: 'macOS Desktop',
    // Chrome trên Apple Silicon vẫn gửi "Intel Mac OS X 10_15_7"; kiến trúc thật nằm trong Client Hints.
    ua: (v) => `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
    viewport: null, isMobile: false, hasTouch: false, deviceScaleFactor: 2,
    screen: { width: 1440, height: 900, availTop: 25, availHeight: 875, frameHeight: 79 },
    uaData: { platform: 'macOS', platformVersion: '14.6.1', architecture: 'arm', bitness: '64', model: '' },
    spoof: {
      platform: 'MacIntel', maxTouchPoints: 0, mobile: false, uaPlatform: 'macOS', dpr: 2, vendor: 'Google Inc.',
      hardwareConcurrency: 8, deviceMemory: 8,
      webglVendor: 'Google Inc. (Apple)',
      webglRenderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)',
      webglParams: desktopWebglParams,
    },
  },
  linux: {
    label: 'Linux Desktop',
    ua: (v) => `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`,
    viewport: null, isMobile: false, hasTouch: false, deviceScaleFactor: 1,
    screen: { width: 1920, height: 1080, availHeight: 1053, frameHeight: 77 },
    uaData: { platform: 'Linux', platformVersion: '6.8.0', architecture: 'x86', bitness: '64', model: '' },
    spoof: {
      platform: 'Linux x86_64', maxTouchPoints: 0, mobile: false, uaPlatform: 'Linux', dpr: 1, vendor: 'Google Inc.',
      hardwareConcurrency: 8, deviceMemory: 8,
      webglVendor: 'Google Inc. (Intel)',
      webglRenderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)',
      webglParams: desktopWebglParams,
    },
  },
  android: {
    label: 'Android (Chrome)',
    ua: (v) => `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Mobile Safari/537.36`,
    viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.625,
    screen: { width: 412, height: 915 },
    uaData: { platform: 'Android', platformVersion: '14.0.0', architecture: '', bitness: '', model: 'Pixel 8' },
    spoof: {
      platform: 'Linux armv8l', maxTouchPoints: 5, mobile: true, uaPlatform: 'Android', dpr: 2.625, vendor: 'Google Inc.',
      hardwareConcurrency: 9, deviceMemory: 8,
      webglVendor: 'ARM',
      webglRenderer: 'Mali-G715',
    },
  },
  // iPad/iPhone: Chrome trên iOS là WebKit nên giả lập từ Blink chỉ ở mức bề mặt (UA, platform, màn hình).
  ipad: {
    label: 'iPad (Chrome)',
    ua: (v) => `Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${v} Mobile/15E148 Safari/604.1`,
    viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    screen: { width: 820, height: 1180 },
    spoof: {
      platform: 'iPad', maxTouchPoints: 5, mobile: false, uaPlatform: 'iOS', dpr: 2, vendor: 'Apple Computer, Inc.',
      hardwareConcurrency: 8,
      webglVendor: 'Apple Inc.',
      webglRenderer: 'Apple GPU',
    },
  },
  ios: {
    label: 'iPhone (Chrome)',
    ua: (v) => `Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/${v} Mobile/15E148 Safari/604.1`,
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    screen: { width: 390, height: 844 },
    spoof: {
      platform: 'iPhone', maxTouchPoints: 5, mobile: true, uaPlatform: 'iOS', dpr: 3, vendor: 'Apple Computer, Inc.',
      hardwareConcurrency: 6,
      webglVendor: 'Apple Inc.',
      webglRenderer: 'Apple GPU',
    },
  },
};

export const autoRefill = {
  enabled: true,
  settings: null,
  targetCount: 0,
  queued: false,
  message: 'Tự bù đang bật; mở profile để bắt đầu.',
  sequential: false, // Chế độ tuần tự: 1 tab, delay 5s giữa các phiên
  deviceProfiles: ['windows'], // Danh sách profile thiết bị đang được dùng
  stopRequested: false, // Cờ yêu cầu dừng hẳn toàn bộ luồng, không mở hay bù thêm slot nào
};

/** Lấy profile thiết bị tiếp theo theo vòng tròn xoay vòng toàn cục. */
export function getNextDeviceProfile() {
  const profiles = autoRefill.deviceProfiles?.length > 0 ? autoRefill.deviceProfiles : ['windows'];
  const profile = profiles[deviceProfileRotationCounter % profiles.length];
  deviceProfileRotationCounter += 1;
  return profile;
}

/** Đặt lại bộ đếm xoay vòng thiết bị về 0 (phục vụ test). */
export function resetDeviceProfileRotation() {
  deviceProfileRotationCounter = 0;
}

/**
 * Danh sách các proxy server / line đang được mở hoặc đang trong tiến trình mở.
 * Khóa này đảm bảo 2 luồng / 2 offer không bao giờ mở cùng 1 IP đồng thời.
 */
export const activeProxyLocks = new Set();

/**
 * Danh sách các IP exit đang hoạt động đồng thời trên bất kỳ trình duyệt nào.
 */
export const activeExitIpLocks = new Set();

/**
 * Kiểm tra xem một proxy có đang được sử dụng ở bất kỳ cửa sổ nào không.
 *
 * @param {object|null} proxy Đối tượng proxy cần kiểm tra.
 * @return {boolean} True nếu proxy đang bận.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function isProxyCurrentlyActive(proxy) {
  if (!proxy) return false;
  if (!proxy.server) return false;
  const identity = proxyIdentity(proxy);
  if (activeProxyLocks.has(identity)) return true;
  for (const session of activeBrowsers) {
    if (session.proxy?.server && proxyIdentity(session.proxy) === identity) return true;
  }
  return false;
}

/**
 * Kiểm tra xem một IP exit có đang chạy đồng thời ở bất kỳ cửa sổ nào không.
 *
 * @param {string|null} exitIp Địa chỉ IP exit.
 * @return {boolean} True nếu IP đang bận.
 */
export function isExitIpCurrentlyInUse(exitIp) {
  if (!exitIp) return false;
  if (activeExitIpLocks.has(exitIp)) return true;
  for (const session of activeBrowsers) {
    if (session.exitIp === exitIp) return true;
  }
  return false;
}

/**
 * Đặt khóa độc quyền cho proxy trước khi khởi chạy trình duyệt.
 *
 * @param {object|null} proxy Đối tượng proxy.
 * @return {void} Không trả giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function acquireProxyLock(proxy) {
  if (proxy?.server) activeProxyLocks.add(proxyIdentity(proxy));
}

/**
 * Giải phóng khóa độc quyền cho proxy và IP khi phiên kết thúc hoặc lỗi.
 *
 * @param {object|null} proxy Đối tượng proxy.
 * @param {string|null} exitIp Địa chỉ IP exit (nếu có).
 * @return {void} Không trả giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function releaseProxyLock(proxy, exitIp = null) {
  if (proxy?.server) activeProxyLocks.delete(proxyIdentity(proxy));
  if (exitIp) activeExitIpLocks.delete(exitIp);
}

/**
 * Quản lý trạng thái đa luồng nhiều offer:
 * - 1 proxy có thể dùng lại tuần tự cho tất cả các offer (Offer 1, Offer 2, ...)
 * - Phân bổ tránh nhau: các luồng duyệt proxy với độ lệch (stride) hoặc hướng đi ngược nhau
 * - Tuyệt đối không mở trùng 1 IP cho 2 offer cùng lúc
 */
export const multiOfferState = {
  enabled: false,
  offerCount: 1,
  offerUrls: [],
  offerUsed: new Map(), // offerNumber -> Set(pKey)
  offerCursors: new Map(), // offerNumber -> current index
  offerDirections: new Map(), // offerNumber -> 1 (forward) | -1 (reverse)
};

/**
 * Quản lý trạng thái chia 2 luồng song song (giữ tương thích ngược với API cũ).
 */
export const dualStreamState = {
  enabled: false,
  websiteUrl1: '',
  websiteUrl2: '',
  stream1Index: 0,
  stream2Index: -1,
  stream1Used: new Set(),
  stream2Used: new Set(),
};

/**
 * Đặt lại toàn bộ trạng thái đa offer và khóa proxy.
 */
export function resetMultiOfferState() {
  activeProxyLocks.clear();
  activeExitIpLocks.clear();
  multiOfferState.enabled = false;
  multiOfferState.offerCount = 1;
  multiOfferState.offerUrls = [];
  multiOfferState.offerUsed.clear();
  multiOfferState.offerCursors.clear();
  multiOfferState.offerDirections.clear();
  dualStreamState.stream1Index = 0;
  dualStreamState.stream2Index = -1;
  dualStreamState.stream1Used.clear();
  dualStreamState.stream2Used.clear();
}

/**
 * Đồng bộ giữa multiOfferState và dualStreamState để giữ tính tương thích.
 */
export function syncDualStreamState(offerCount = 2) {
  dualStreamState.enabled = offerCount >= 2;
  dualStreamState.stream1Used = multiOfferState.offerUsed.get(1) || new Set();
  dualStreamState.stream2Used = multiOfferState.offerUsed.get(2) || new Set();
  dualStreamState.stream1Index = multiOfferState.offerCursors.get(1) ?? 0;
  dualStreamState.stream2Index = multiOfferState.offerCursors.get(2) ?? -1;
}

/**
 * Khởi tạo độ lệch phân bổ cho K offer trên M proxy để các luồng tránh nhau tối đa.
 *
 * @param {number} offerCount Tổng số offer đang cấu hình.
 * @param {number} totalProxies Tổng số proxy trong danh sách.
 */
export function initMultiOfferCursors(offerCount, totalProxies) {
  const M = Math.max(1, totalProxies);
  const count = Math.max(1, offerCount);
  multiOfferState.offerCount = count;
  for (let k = 1; k <= count; k++) {
    if (!multiOfferState.offerUsed.has(k)) {
      multiOfferState.offerUsed.set(k, new Set());
    }
    if (count === 2) {
      multiOfferState.offerCursors.set(k, k === 1 ? 0 : Math.max(0, M - 1));
      multiOfferState.offerDirections.set(k, k === 1 ? 1 : -1);
    } else {
      const offset = Math.floor(((k - 1) * M) / count) % M;
      multiOfferState.offerCursors.set(k, offset);
      multiOfferState.offerDirections.set(k, 1);
    }
  }
}

/**
 * Kiểm tra xem một proxy đã được hoàn tất bởi TẤT CẢ các offer đang cấu hình chưa.
 *
 * @param {object} proxy Đối tượng proxy.
 * @param {number} offerCount Tổng số offer.
 * @return {boolean} True nếu tất cả offer đều đã dùng proxy này.
 */
export function isProxyUsedByAllOffers(proxy, offerCount = 1) {
  if (!proxy) return false;
  const pKey = proxy.server || proxy._queueLine;
  if (!pKey) return false;
  const count = Math.max(1, offerCount);
  for (let k = 1; k <= count; k++) {
    const usedSet = multiOfferState.offerUsed.get(k);
    if (!usedSet || !usedSet.has(pKey)) {
      return false;
    }
  }
  return true;
}

/**
 * Thuật toán phân bổ proxy tránh nhau đa luồng (Collision-Free Multi-Offer Allocator):
 * - 1 proxy dùng được lại cho tất cả offer (khi offer trước đã hoàn tất và đóng trình duyệt).
 * - Tránh mở 1 IP cho 2 offer cùng nhau: bỏ qua các proxy đang active ở bất kỳ cửa sổ nào khác.
 * - Phân bổ lệch pha (stride / reversed) theo từng offer để các luồng không va chạm.
 *
 * @param {number} offerNumber Số thứ tự của offer (1, 2, ...).
 * @param {Array<object>} proxies Danh sách proxy khả dụng.
 * @param {number} offerCount Tổng số offer cấu hình.
 * @return {object|null} Proxy được chọn và khóa độc quyền, hoặc null nếu không còn proxy rảnh.
 */
export function getNextCollisionFreeProxy(offerNumber = 1, proxies = [], offerCount = 1) {
  if (!proxies.length) return null;
  const M = proxies.length;
  const totalOffers = Math.max(offerCount, offerNumber, 1);

  // Đồng bộ từ dualStreamState nếu có cập nhật bên ngoài
  if (dualStreamState.stream1Used) {
    if (!multiOfferState.offerUsed.has(1)) multiOfferState.offerUsed.set(1, dualStreamState.stream1Used);
    else if (dualStreamState.stream1Used.size === 0 && multiOfferState.offerUsed.get(1).size > 0) {
      multiOfferState.offerUsed.get(1).clear();
    }
  }
  if (dualStreamState.stream2Used) {
    if (!multiOfferState.offerUsed.has(2)) multiOfferState.offerUsed.set(2, dualStreamState.stream2Used);
    else if (dualStreamState.stream2Used.size === 0 && multiOfferState.offerUsed.get(2).size > 0) {
      multiOfferState.offerUsed.get(2).clear();
    }
  }

  if (!multiOfferState.offerUsed.has(offerNumber)) {
    multiOfferState.offerUsed.set(offerNumber, new Set());
  }
  const usedSet = multiOfferState.offerUsed.get(offerNumber);

  // Nếu offer này đã dùng qua tất cả proxy trong danh sách, tự động xoá usedSet để bắt đầu vòng mới
  if (usedSet.size >= M) {
    usedSet.clear();
  }

  // Khởi tạo cursor nếu chưa có
  if (!multiOfferState.offerCursors.has(offerNumber)) {
    if (totalOffers === 2) {
      const startIdx = offerNumber === 1 ? (dualStreamState.stream1Index || 0) : (dualStreamState.stream2Index >= 0 ? dualStreamState.stream2Index : Math.max(0, M - 1));
      const direction = offerNumber === 1 ? 1 : -1;
      multiOfferState.offerCursors.set(offerNumber, startIdx);
      multiOfferState.offerDirections.set(offerNumber, direction);
    } else {
      const startIdx = Math.floor(((offerNumber - 1) * M) / totalOffers) % M;
      multiOfferState.offerCursors.set(offerNumber, startIdx);
      multiOfferState.offerDirections.set(offerNumber, 1);
    }
  } else {
    if (offerNumber === 1 && Number.isInteger(dualStreamState.stream1Index) && dualStreamState.stream1Index !== multiOfferState.offerCursors.get(1)) {
      multiOfferState.offerCursors.set(1, dualStreamState.stream1Index);
    }
    if (offerNumber === 2 && Number.isInteger(dualStreamState.stream2Index) && dualStreamState.stream2Index !== multiOfferState.offerCursors.get(2)) {
      multiOfferState.offerCursors.set(2, dualStreamState.stream2Index >= 0 ? dualStreamState.stream2Index : Math.max(0, M - 1));
    }
  }

  let cursor = multiOfferState.offerCursors.get(offerNumber) ?? 0;
  const direction = multiOfferState.offerDirections.get(offerNumber) ?? 1;

  for (let step = 0; step < M; step++) {
    const idx = ((cursor + (step * direction)) % M + M) % M;
    const candidate = proxies[idx];
    if (!candidate) continue;

    const pKey = candidate.server || candidate._queueLine || String(idx);

    // 1. Offer này đã dùng proxy này chưa?
    if (usedSet.has(pKey)) {
      continue;
    }

    // 2. Proxy này có đang được mở ở offer / cửa sổ khác cùng lúc không?
    if (isProxyCurrentlyActive(candidate)) {
      continue; // Đang chạy, tạm thời bỏ qua để không trùng IP đồng thời
    }

    // Proxy hợp lệ: khóa ngay lập tức và ghi nhận đã dùng cho offer này
    acquireProxyLock(candidate);
    usedSet.add(pKey);

    const nextCursor = ((idx + direction) % M + M) % M;
    multiOfferState.offerCursors.set(offerNumber, nextCursor);

    syncDualStreamState(totalOffers);
    void saveDualStreamState();

    return candidate;
  }

  // Nếu vòng lặp đầu tiên không tìm được proxy (do các proxy rảnh đều đã nằm trong usedSet của lượt trước),
  // và còn ít nhất 1 proxy không bận ở cửa sổ khác: reset usedSet cho offer này và thử lại một lượt.
  const hasInactiveProxy = proxies.some((p) => !isProxyCurrentlyActive(p));
  if (hasInactiveProxy) {
    usedSet.clear();
    for (let step = 0; step < M; step++) {
      const idx = ((cursor + (step * direction)) % M + M) % M;
      const candidate = proxies[idx];
      if (!candidate) continue;

      if (isProxyCurrentlyActive(candidate)) {
        continue;
      }

      const pKey = candidate.server || candidate._queueLine || String(idx);
      acquireProxyLock(candidate);
      usedSet.add(pKey);

      const nextCursor = ((idx + direction) % M + M) % M;
      multiOfferState.offerCursors.set(offerNumber, nextCursor);

      syncDualStreamState(totalOffers);
      void saveDualStreamState();

      return candidate;
    }
  }

  return null;
}

/**
 * Lấy proxy tiếp theo cho luồng tương ứng (giữ tương thích hàm getNextProxyForStream cũ).
 *
 * @param {number} streamRole 1 hoặc 2.
 * @param {Array<object>} proxies Danh sách proxy khả dụng.
 * @return {object|null} Proxy được chọn hoặc null nếu không còn proxy phù hợp.
 */
export function getNextProxyForStream(streamRole, proxies = []) {
  return getNextCollisionFreeProxy(streamRole, proxies, 2);
}

let proxyHistoryWriteQueue = Promise.resolve();

// ─── Remote Agent Registry ────────────────────────────────────────────────────
// agentId → { platform, hostname, maxSlots, freeSlots, activeTasks, lastSeen, enabled }
const instanceId = process.env.AUTOLEADPC_INSTANCE || '1';
const instanceSuffix = instanceId !== '1' ? `-${instanceId}` : '';
export const dataDirName = process.env.AUTOLEADPC_DATA_DIR || `AutoLeadPC${instanceSuffix}`;
const baseDataDirectory = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC');
export const appDataDirectory = join(homedir(), 'Library', 'Application Support', dataDirName);
export const dualStreamStatePath = join(appDataDirectory, 'dual-stream-state.json');

export async function loadDualStreamState() {
  try {
    const data = JSON.parse(await readFile(dualStreamStatePath, 'utf8'));
    if (data && typeof data === 'object') {
      dualStreamState.enabled = Boolean(data.enabled);
      dualStreamState.websiteUrl1 = data.websiteUrl1 || '';
      dualStreamState.websiteUrl2 = data.websiteUrl2 || '';
      dualStreamState.stream1Index = Number(data.stream1Index) || 0;
      dualStreamState.stream2Index = Number.isInteger(data.stream2Index) ? data.stream2Index : -1;
      dualStreamState.stream1Used = new Set(Array.isArray(data.stream1Used) ? data.stream1Used : []);
      dualStreamState.stream2Used = new Set(Array.isArray(data.stream2Used) ? data.stream2Used : []);

      if (data.multiOffer && typeof data.multiOffer === 'object') {
        multiOfferState.enabled = Boolean(data.multiOffer.enabled ?? dualStreamState.enabled);
        multiOfferState.offerCount = Number(data.multiOffer.offerCount) || 2;
        multiOfferState.offerUrls = Array.isArray(data.multiOffer.offerUrls) ? data.multiOffer.offerUrls : [];
        if (data.multiOffer.offerCursors) {
          multiOfferState.offerCursors = new Map(
            Object.entries(data.multiOffer.offerCursors).map(([k, v]) => [Number(k), Number(v)])
          );
        }
        if (data.multiOffer.offerUsed) {
          multiOfferState.offerUsed = new Map(
            Object.entries(data.multiOffer.offerUsed).map(([k, v]) => [Number(k), new Set(v)])
          );
        }
      } else {
        multiOfferState.offerUsed.set(1, dualStreamState.stream1Used);
        multiOfferState.offerUsed.set(2, dualStreamState.stream2Used);
        multiOfferState.offerCursors.set(1, dualStreamState.stream1Index);
        multiOfferState.offerCursors.set(2, dualStreamState.stream2Index);
      }
    }
  } catch {}
}

export async function saveDualStreamState() {
  try {
    syncDualStreamState(multiOfferState.offerCount || 2);
    const data = {
      enabled: dualStreamState.enabled,
      websiteUrl1: dualStreamState.websiteUrl1,
      websiteUrl2: dualStreamState.websiteUrl2,
      stream1Index: dualStreamState.stream1Index,
      stream2Index: dualStreamState.stream2Index,
      stream1Used: [...dualStreamState.stream1Used],
      stream2Used: [...dualStreamState.stream2Used],
      multiOffer: {
        enabled: multiOfferState.enabled,
        offerCount: multiOfferState.offerCount,
        offerUrls: multiOfferState.offerUrls,
        offerCursors: Object.fromEntries(multiOfferState.offerCursors.entries()),
        offerUsed: Object.fromEntries(
          [...multiOfferState.offerUsed.entries()].map(([k, set]) => [k, [...set]])
        ),
      },
    };
    await writeFile(dualStreamStatePath, JSON.stringify(data, null, 2)).catch(() => {});
  } catch {}
}

export function getAutoLeadPCDir() {
  const custom = join(homedir(), '.autoleadpc');
  if (existsSync(custom)) return custom;
  return join(homedir(), 'Downloads', 'AutoLeadPC');
}

const remoteAgents = new Map();
// Tasks dequeued from proxy/autofill queue, waiting for a remote agent to pick up
const pendingAgentTasks = [];
const userInterfacePath = new URL('./index.html', import.meta.url);
const userInterfacePcPath = new URL('./index-pc.html', import.meta.url);
const userAgentListPath = new URL('./useragents.txt', import.meta.url);
export const interactionLogDirectory = join(appDataDirectory, 'logs');
export const interactionHtmlDirectory = join(interactionLogDirectory, 'html');
export const interactionLogFilePath = join(interactionLogDirectory, 'browser-logs.json');

/** @type {Map<object, Array<{time:string,type:string,[key:string]:any}>>} */
const browserSessionLogs = new Map();
/** @type {Array<{id: string, slot: number, ip: string, version: string, startedAt: string, logs: Array<object>}>} */
export let persistedBrowserLogs = [];
let saveBrowserLogsTimer = null;

export async function loadPersistedBrowserLogs() {
  try {
    await mkdir(interactionHtmlDirectory, { recursive: true });
    const raw = await readFile(interactionLogFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      persistedBrowserLogs = parsed;
    }
  } catch {
    persistedBrowserLogs = [];
  }
}

export async function savePersistedBrowserLogs() {
  try {
    await mkdir(interactionLogDirectory, { recursive: true });
    if (persistedBrowserLogs.length > 100) {
      persistedBrowserLogs = persistedBrowserLogs.slice(0, 100);
    }
    await writeFile(interactionLogFilePath, JSON.stringify(persistedBrowserLogs, null, 2), 'utf8');
  } catch (err) {
    console.error('Lỗi khi lưu browser-logs.json:', err.message);
  }
}

export function queueSaveBrowserLogs() {
  if (saveBrowserLogsTimer) return;
  saveBrowserLogsTimer = setTimeout(() => {
    saveBrowserLogsTimer = null;
    void savePersistedBrowserLogs();
  }, 1000);
}

export async function countSavedHtmlFiles() {
  try {
    await mkdir(interactionHtmlDirectory, { recursive: true });
    const entries = await readdir(interactionHtmlDirectory, { withFileTypes: true });
    let count = 0;
    for (const ent of entries) {
      if (ent.isFile() && ent.name.endsWith('.html')) count++;
      else if (ent.isDirectory()) {
        try {
          const subFiles = await readdir(join(interactionHtmlDirectory, ent.name));
          count += subFiles.filter((f) => f.endsWith('.html')).length;
        } catch {}
      }
    }
    return count;
  } catch {
    return 0;
  }
}

export async function openLogsHtmlDirectoryInFinder(offerNumber = null) {
  let targetDir = interactionHtmlDirectory;
  if (offerNumber && offerNumber !== 'all') {
    const sub = join(interactionHtmlDirectory, `offer-${offerNumber}`);
    await mkdir(sub, { recursive: true });
    targetDir = sub;
  } else {
    await mkdir(targetDir, { recursive: true });
  }
  await executeFile('open', [targetDir]);
}

export async function clearAllLogsAndHtml(offerNumber = null) {
  try {
    if (offerNumber && offerNumber !== 'all') {
      const oStr = String(offerNumber);
      persistedBrowserLogs = persistedBrowserLogs.filter((s) => String(s.offer || 1) !== oStr);
      for (const [session, logs] of browserSessionLogs.entries()) {
        if (String(session.offerNumber ?? session.streamRole ?? 1) === oStr) {
          logs.length = 0;
        }
      }
      const sub = join(interactionHtmlDirectory, `offer-${offerNumber}`);
      if (existsSync(sub)) {
        await rm(sub, { recursive: true, force: true }).catch(() => {});
      }
      await savePersistedBrowserLogs();
      return { success: true, message: `Đã xóa log và file HTML của Offer ${offerNumber}.` };
    }
    await rm(interactionHtmlDirectory, { recursive: true, force: true });
    await mkdir(interactionHtmlDirectory, { recursive: true });
    await rm(interactionLogFilePath, { force: true }).catch(() => {});
    persistedBrowserLogs = [];
    for (const logs of browserSessionLogs.values()) {
      logs.length = 0;
    }
    return { success: true, message: 'Đã xóa toàn bộ log và các file HTML đã lưu.' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
const autoRefillSettingsPath = join(appDataDirectory, 'autorefill-settings.json');

async function saveAutoRefillSettings() {
  if (!autoRefill.settings) return;
  try {
    await writeFile(autoRefillSettingsPath, JSON.stringify({
      settings: autoRefill.settings,
      targetCount: autoRefill.targetCount,
      sequential: autoRefill.sequential,
    }), 'utf8');
  } catch {}
}

async function loadAutoRefillSettings() {
  try {
    const raw = JSON.parse(await readFile(autoRefillSettingsPath, 'utf8'));
    if (raw?.settings) {
      autoRefill.settings = raw.settings;
      autoRefill.targetCount = raw.targetCount || 1;
      autoRefill.sequential = raw.sequential || false;
      autoRefill.message = 'Đã khôi phục cấu hình sau restart; đang bù slot...';
    }
  } catch {}
}

const toffersConfigPath = join(appDataDirectory, 'toffers-config.json');
export const leadStatsPath = join(appDataDirectory, 'lead-stats.json');
let saveLeadStatsTimer = null;

export async function loadLeadStats() {
  try {
    const raw = JSON.parse(await readFile(leadStatsPath, 'utf8'));
    initLeadIpStats(raw);
    console.log(`[LeadStats] Đã tải ${leadIpStatsMap.size} IP có lead từ ${leadStatsPath}`);
  } catch {}
}

export function queueSaveLeadStats() {
  if (saveLeadStatsTimer) return;
  saveLeadStatsTimer = setTimeout(async () => {
    saveLeadStatsTimer = null;
    try {
      const data = Object.fromEntries(leadIpStatsMap);
      await mkdir(appDataDirectory, { recursive: true });
      await writeFile(leadStatsPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
      console.warn('[LeadStats] Lỗi khi lưu lead-stats.json:', err.message);
    }
  }, 500);
}

export function saveAndRecordLeadIpStats(entry) {
  const res = recordLeadIpStats(entry);
  if (res) queueSaveLeadStats();
  return res;
}

export let latestToffersOverview = {
  success: false,
  point: null,
  results: [],
  check: null,
  error: null,
  updatedAt: null,
};
let toffersAutoRefreshTimer = null;

async function loadToffersConfig() {
  try {
    const raw = JSON.parse(await readFile(toffersConfigPath, 'utf8'));
    if (raw && typeof raw === 'object') {
      if (raw.cookie) updateLeadConfig({ cookie: raw.cookie });
      if (raw.datas) updateLeadConfig({ datas: raw.datas });
      if (raw.pointUrl) updateLeadConfig({ pointUrl: raw.pointUrl });
      if (raw.apiUrl) updateLeadConfig({ apiUrl: raw.apiUrl });
    }
  } catch {}
}

async function saveToffersConfig(cfg = {}) {
  try {
    const data = {
      cookie: cfg.cookie || DEFAULT_LEAD_CONFIG.cookie,
      datas: cfg.datas || DEFAULT_LEAD_CONFIG.datas,
      pointUrl: cfg.pointUrl || DEFAULT_LEAD_CONFIG.pointUrl,
      apiUrl: cfg.apiUrl || DEFAULT_LEAD_CONFIG.apiUrl,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(toffersConfigPath, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

export async function refreshToffersOverview(customConfig = null) {
  const config = {
    datas: customConfig?.datas || DEFAULT_LEAD_CONFIG.datas || '1504',
    cookie: customConfig?.cookie || DEFAULT_LEAD_CONFIG.cookie,
    pointUrl: customConfig?.pointUrl || DEFAULT_LEAD_CONFIG.pointUrl,
    apiUrl: customConfig?.apiUrl || DEFAULT_LEAD_CONFIG.apiUrl,
  };

  if (customConfig?.cookie && customConfig.cookie !== DEFAULT_LEAD_CONFIG.cookie) {
    updateLeadConfig({ cookie: customConfig.cookie });
    void saveToffersConfig(config);
  }
  if (customConfig?.datas && customConfig.datas !== DEFAULT_LEAD_CONFIG.datas) {
    updateLeadConfig({ datas: customConfig.datas });
    void saveToffersConfig(config);
  }

  try {
    const overview = await fetchToffersOverview(config);
    if (overview.success) {
      const prevPoint = latestToffersOverview.point;
      const prevLeadCount = latestToffersOverview.results?.length || 0;
      latestToffersOverview = overview;
      if (prevPoint !== overview.point || prevLeadCount !== overview.results.length) {
        console.log(`[Toffers] [10s Auto-check] Cập nhật: Point = ${overview.point} pt | Tổng số leads = ${overview.results.length}`);
      }
    } else {
      latestToffersOverview = {
        ...overview,
        point: latestToffersOverview.point, // Giữ điểm cũ nếu mạng chập chờn
      };
    }
    return latestToffersOverview;
  } catch (err) {
    latestToffersOverview = {
      ...latestToffersOverview,
      error: err.message,
    };
    return latestToffersOverview;
  }
}

export function startToffersBackgroundPolling(intervalMs = 10_000) {
  if (toffersAutoRefreshTimer) clearInterval(toffersAutoRefreshTimer);
  // Thực hiện gọi lần đầu
  void refreshToffersOverview();
  toffersAutoRefreshTimer = setInterval(() => {
    void refreshToffersOverview();
  }, intervalMs);
  console.log(`[Toffers] Đã kích hoạt tiến trình tự động gọi API lấy lead & point chu kỳ mỗi ${intervalMs / 1000}s.`);
}

const chromeProfileDirectory = join(appDataDirectory, 'chrome-profiles');
const chromeProfileCacheDirectory = join(homedir(), 'Library', 'Caches', dataDirName, 'chrome-profiles');
const installedChromeAppPath = process.env.AUTOLEADPC_CHROME_APP || '/Applications/Google Chrome.app';
const chromeChannelDirectory = join(baseDataDirectory, 'chrome-channels');
const chromeRegularBuildDirectory = join(baseDataDirectory, 'chrome-regular-builds');
const roboFormExtensionId = 'pnlccmojcmeohlpggmfnbbiapkmbliob';
const chromeTemplateProfileDirectory = join(baseDataDirectory, 'chrome-template-profile');
const chromeTemplateMetadataName = 'autoleadpc-template.json';
// Khóa tiến trình, cache và phiên tab của profile mẫu không được chép sang profile mới.
const chromeTemplateSkippedNames = new Set([
  'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'RunningChromeVersion', chromeTemplateMetadataName,
  'Cache', 'Code Cache', 'GPUCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache', 'DawnCache',
  'DawnGraphiteCache', 'DawnWebGPUCache', 'Crashpad', 'Sessions',
]);
let templateProfileContext = null;
const proxyUsageHistoryPath = join(appDataDirectory, 'proxy-usage.json');
const autofillUsedPath = join(appDataDirectory, 'autofill-used.json');
/** @type {Set<string>} fingerprint = JSON của record đã dùng */
let autofillUsedKeys = new Set();
const autofillQueuePath = join(appDataDirectory, 'autofill-queue.json');
/** Hàng đợi thông tin autofill: available = chưa dùng, used = đã dùng. */
const autofillQueue = { available: /** @type {object[]} */ ([]), used: /** @type {object[]} */ ([]) };
const proxyQueuePath = join(appDataDirectory, 'proxy-queue.json');
/** Hàng đợi proxy: available = chưa dùng, used = đã dùng (raw lines gốc). */
export const proxyQueue = { available: /** @type {string[]} */ ([]), used: /** @type {string[]} */ ([]) };
export const emailQueuePath = join(appDataDirectory, 'email-queue.json');
const proxy711ConfigPath = join(appDataDirectory, '711proxy-config.json');
const proxy711 = { username: '', passwd: '', token: '', tokenExpiry: 0 };
const proxy711AutoRefillConfigPath = join(appDataDirectory, '711proxy-autorefill.json');
const proxy711AutoRefill = { enabled: false, region: 'US', count: 50, sessTime: 20, sessAuto: false };
let proxy711AutoRefilling = false;

async function loadProxy711Config() {
  try {
    const d = JSON.parse(await readFile(proxy711ConfigPath, 'utf8'));
    if (d.username) proxy711.username = d.username;
    if (d.passwd) proxy711.passwd = d.passwd;
    if (d.token) proxy711.token = d.token;
    if (d.tokenExpiry) proxy711.tokenExpiry = Number(d.tokenExpiry);
  } catch {}
}

async function saveProxy711Config() {
  await writeFile(proxy711ConfigPath, JSON.stringify({
    username: proxy711.username,
    passwd: proxy711.passwd || '',
    token: proxy711.token,
    tokenExpiry: proxy711.tokenExpiry,
  })).catch(() => {});
}

async function ensure711Token() {
  if (proxy711.token && Date.now() < proxy711.tokenExpiry) {
    return proxy711.token;
  }
  if (proxy711.username && proxy711.passwd) {
    try {
      return await fetch711Token(proxy711.username, proxy711.passwd);
    } catch {}
  }
  return null;
}

export async function add711IpWhitelist(ip, token = null) {
  if (!ip) throw new Error('Cần địa chỉ IP để thêm vào whitelist.');
  const curToken = token || await ensure711Token();
  if (!curToken) {
    throw new Error(`Chưa đăng nhập 711proxy. Vui lòng đăng nhập 711proxy trên app để tự động thêm IP ${ip} vào whitelist.`);
  }

  const res = await fetch('https://server.711proxy.com/whitelist/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${curToken}`,
    },
    body: JSON.stringify({ ip: [ip], status: true }),
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}

  if (data?.code === 41010 || data?.error?.toLowerCase().includes('token')) {
    proxy711.token = '';
    proxy711.tokenExpiry = 0;
    await saveProxy711Config();
    if (proxy711.username && proxy711.passwd) {
      const freshToken = await fetch711Token(proxy711.username, proxy711.passwd).catch(() => null);
      if (freshToken) {
        return add711IpWhitelist(ip, freshToken);
      }
    }
    throw new Error(`Token 711proxy hết hạn (41010). Vui lòng đăng nhập lại rồi thêm IP ${ip} vào whitelist.`);
  }

  if (res.ok || (data && !data.error && data.code === 0)) {
    return { ok: true, ip, data };
  }

  throw new Error(data?.message || data?.error || `HTTP ${res.status}: ${text.slice(0, 200)}`);
}

async function loadProxy711AutoRefillConfig() {
  try {
    const d = JSON.parse(await readFile(proxy711AutoRefillConfigPath, 'utf8'));
    if (typeof d.enabled === 'boolean') proxy711AutoRefill.enabled = d.enabled;
    if (typeof d.region === 'string') proxy711AutoRefill.region = d.region;
    if (typeof d.count === 'number') proxy711AutoRefill.count = d.count;
    if (typeof d.sessTime === 'number') proxy711AutoRefill.sessTime = d.sessTime;
    if (typeof d.sessAuto === 'boolean') proxy711AutoRefill.sessAuto = d.sessAuto;
  } catch {}
}

async function saveProxy711AutoRefillConfig() {
  await writeFile(proxy711AutoRefillConfigPath, JSON.stringify(proxy711AutoRefill)).catch(() => {});
}

async function autoRefillProxyIfNeeded() {
  if (!proxy711AutoRefill.enabled || proxy711AutoRefilling) return;
  if (proxyQueue.available.length > 0) return;
  proxy711AutoRefilling = true;
  try {
    const genUrl = new URL('http://global.rotgbapi.trustsource.live:8089/gen');
    genUrl.searchParams.set('zone', 'custom');
    genUrl.searchParams.set('ptype', '1');
    genUrl.searchParams.set('region', proxy711AutoRefill.region);
    genUrl.searchParams.set('count', String(proxy711AutoRefill.count));
    genUrl.searchParams.set('proto', 'http');
    genUrl.searchParams.set('stype', 'text');
    genUrl.searchParams.set('split', '\r\n');
    genUrl.searchParams.set('sessType', 'sticky');
    genUrl.searchParams.set('sessTime', String(proxy711AutoRefill.sessTime));
    genUrl.searchParams.set('sessAuto', proxy711AutoRefill.sessAuto ? '1' : '0');

    let text;
    try {
      const res = await fetch(genUrl.toString());
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      text = await res.text();
      if (!text.trim() || text.includes('"code"')) throw new Error(text.slice(0, 200));
    } catch (e) {
      if (e.message.toLowerCase().includes('whitelist')) {
        const ipRes = await fetch('https://api.ipify.org?format=json').catch(() => null);
        const ip = ipRes ? (await ipRes.json().catch(() => ({}))).ip : null;
        const token = await ensure711Token();
        if (ip && token) {
          await add711IpWhitelist(ip, token);
          await new Promise((r) => setTimeout(r, 2000));
          const retryRes = await fetch(genUrl.toString());
          if (!retryRes.ok) throw new Error(`HTTP ${retryRes.status}: ${await retryRes.text()}`);
          text = await retryRes.text();
          if (!text.trim() || text.includes('"code"')) throw new Error(text.slice(0, 200));
        } else {
          throw new Error(`IP ${ip || 'hiện tại'} chưa có trong whitelist 711proxy. Vui lòng đăng nhập lại 711proxy để tự động thêm whitelist.`);
        }
      } else {
        throw e;
      }
    }

    const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const proxyLines = rawLines.map((l) => {
      if (/^https?:\/\//i.test(l)) return l;
      const at = l.lastIndexOf('@');
      if (at > 0) return `http://${l.slice(0, at)}@${l.slice(at + 1)}`;
      const parts = l.split(':');
      if (parts.length === 4) return `http://${encodeURIComponent(parts[2])}:${encodeURIComponent(parts[3])}@${parts[0]}:${parts[1]}`;
      return `http://${l}`;
    });
    const added = importProxyLines(proxyLines, 'http');
    if (added > 0) {
      await saveProxyQueue();
      console.log(`[Proxy711AutoRefill] Đã tự động nạp thêm ${added} proxy.`);
      void tgNotify(`📦 Tự động mua thêm <b>${added} proxy</b> từ 711proxy. Hàng đợi: ${proxyQueue.available.length} proxy.`);
      queueAutomaticRefill();
    }
  } catch (e) {
    console.log('[Proxy711AutoRefill] Lỗi tự động nạp proxy:', e.message);
    void tgNotify(`⚠️ Lỗi tự động mua proxy 711: ${e.message}`);
  } finally {
    proxy711AutoRefilling = false;
  }
}

async function fetch711Token(username, passwd) {
  for (const endpoint of [
    'https://server.711proxy.com/eapi/token/',
    'https://server.711proxy.com/wapi/token/',
  ]) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, passwd }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { continue; }
    if (data.results) {
      proxy711.username = username;
      proxy711.passwd = passwd;
      proxy711.token = data.results;
      proxy711.tokenExpiry = Date.now() + 3_600_000;
      await saveProxy711Config();
      return proxy711.token;
    }
  }
  throw new Error('Đăng nhập thất bại. Kiểm tra lại tài khoản 711proxy.');
}
/** Hàng đợi email mẫu: available = chưa dùng, used = đã dùng. */
export const emailQueue = { available: /** @type {string[]} */ ([]), used: /** @type {string[]} */ ([]) };
const emailAutoRefillConfigPath = join(appDataDirectory, 'email-autorefill.json');
/** Cấu hình tự động nạp email từ file nguồn khi hàng đợi cạn. */
export const emailAutoRefill = { enabled: false, sourcePath: '', batchSize: 1000, byteOffset: 0 };
export const deviceProfilesPath = join(appDataDirectory, 'device-profiles.json');

/** Nếu đang ở instance phụ (vd Bản 2) và file dữ liệu chưa có, sao chép file từ Bản 1 sang để dùng sẵn cấu hình. */
async function seedFileIfMissing(targetPath, sourceFileName) {
  if (dataDirName === 'AutoLeadPC') return;
  try {
    await access(targetPath);
  } catch {
    try {
      const sourcePath = join(baseDataDirectory, sourceFileName);
      await access(sourcePath);
      await mkdir(dirname(targetPath), { recursive: true });
      await cp(sourcePath, targetPath);
      console.log(`[Bản ${instanceId}] Đã khởi tạo dữ liệu mẫu từ ${sourceFileName}`);
    } catch {}
  }
}

/** Đọc cấu hình các profile thiết bị đã chọn từ đĩa. */
export async function loadSavedDeviceProfiles() {
  await seedFileIfMissing(deviceProfilesPath, 'device-profiles.json');
  try {
    const raw = await readFile(deviceProfilesPath, 'utf8');
    const saved = JSON.parse(raw);
    if (Array.isArray(saved) && saved.length > 0) {
      const valid = saved.filter((id) => DEVICE_PROFILES[id]);
      if (valid.length > 0) {
        autoRefill.deviceProfiles = valid;
        return valid;
      }
    }
  } catch {}
  return autoRefill.deviceProfiles;
}

/** Lưu cấu hình các profile thiết bị đã chọn vào đĩa. */
export async function saveSavedDeviceProfiles() {
  try {
    await mkdir(dirname(deviceProfilesPath), { recursive: true });
    await writeFile(deviceProfilesPath, JSON.stringify(autoRefill.deviceProfiles, null, 2), 'utf8');
  } catch (error) {
    console.error(`[DeviceProfiles] Không thể lưu cấu hình thiết bị: ${error.message}`);
  }
}

const port = Number(process.env.AUTOLEADPC_PORT) || 3210;

/**
 * Lỗi xác minh IP qua dịch vụ độc lập; không kết luận proxy đang dùng bị hỏng.
 *
 * @extends Error
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
class IpVerificationError extends Error {
  /**
   * Tạo lỗi riêng để luồng mở trình duyệt dừng thay vì loại proxy theo lỗi dịch vụ IP.
   *
   * @param {string} message Mô tả an toàn, không chứa dữ liệu xác thực proxy.
   * @param {unknown} [cause] Lỗi gốc khi điều hướng hoặc phân tích phản hồi thất bại.
   * @return {void} Khởi tạo lỗi xác minh IP.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-14
   */
  constructor(message, cause) {
    super(message, { cause });
    this.name = 'IpVerificationError';
    this.code = 'IP_VERIFICATION_UNAVAILABLE';
  }
}

/** Số profile được tạo và khởi chạy song song theo mặc định. */
const maxConcurrentProfiles = Number(process.env.AUTOLEADPC_CONCURRENCY) || 10;

/**
 * Ước tính số trình duyệt an toàn theo RAM/CPU để tham khảo.
 *
 * Ước tính 1.5 GB cho mỗi cửa sổ Chrome và dành tối đa 50% RAM tổng cho browser để vẫn chừa tài
 * nguyên cho macOS và các app khác. Dùng RAM tổng thay vì RAM trống vì số RAM trống dao
 * động theo app đang mở; số profile còn bị giới hạn theo CPU.
 *
 * @param {number} cores Số nhân CPU.
 * @param {number} totalBytes Tổng RAM tính theo byte.
 * @return {number} Số cửa sổ nên mở cùng lúc, tối thiểu 1.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
export function recommendedMaxAlive(cores, totalBytes) {
  const perBrowserGb = 1.5;
  const ramBudgetFraction = 0.5;
  const byRam = Math.floor(((totalBytes / 1024 ** 3) * ramBudgetFraction) / perBrowserGb + 1e-9);
  return Math.max(1, Math.min(cores, byRam));
}

const maxAliveBrowsers = Math.max(1, Math.min(10, Math.floor(Number(process.env.AUTOLEADPC_MAX_ALIVE) || 10)));

/** Proxy SOCKS công cộng hay chậm, 10 giây của bản đầu không đủ. */
const navigationTimeout = 30_000;

const checkUrl = 'https://ipinfo.io/json';
/**
 * Các dịch vụ xác minh IP thoát, thử lần lượt cho tới khi có kết quả.
 * Dùng nhiều dịch vụ vì api.ipify.org dễ bị giới hạn tần suất khi mở nhiều cửa sổ cùng lúc.
 */
const browserIpCheckUrls = [
  'https://api.ipify.org?format=json',
  'https://api64.ipify.org?format=json',
  'https://ipinfo.io/json',
];

/** Các trang tự soi fingerprint, lấy từ Config/Browser/bookmarks.txt của bản PC. */
const bookmarks = ['https://iphey.com/', 'https://www.browserscan.net/', 'https://ipinfo.io/json'];

/** Kích thước tối thiểu để vẫn thấy nội dung web khi xếp nhiều profile. */
const minimumWindow = { width: 280, height: 200 };
const maximumWindow = { width: 900, height: 600 };

const fallbackScreen = { width: 1440, height: 900 };

/**
 * Finder trả bounds cả màn hình, nhưng macOS không cho cửa sổ nằm dưới Dock nên nó
 * đẩy hàng cuối lên và các hàng đè nhau. Trừ sẵn phần đáy này ra.
 * ponytail: số cố định vì chiều cao Dock phụ thuộc vị trí và cỡ icon người dùng đặt;
 * đo được 66px với Dock dưới đáy. Đổi qua AUTOLEADPC_BOTTOM_INSET nếu máy khác.
 */
const bottomInset = Number(process.env.AUTOLEADPC_BOTTOM_INSET ?? 70);

/**
 * Chuẩn hoá URL người dùng nhập, tự thêm https:// khi thiếu scheme.
 *
 * @param {string} input Chuỗi URL thô.
 * @return {string} URL đầy đủ.
 * @throws {Error} Khi URL không hợp lệ hoặc không phải http/https.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
export function normalizeUrl(input) {
  const value = (input ?? '').trim();
  if (!value) throw new Error('Hãy nhập URL website đích.');

  let targetUrl;
  try {
    targetUrl = new URL(value.includes('://') ? value : `https://${value}`);
  } catch {
    throw new Error('Hãy nhập URL đầy đủ, ví dụ https://example.com.');
  }
  if (!['http:', 'https:'].includes(targetUrl.protocol)) {
    throw new Error('URL phải bắt đầu bằng http:// hoặc https://.');
  }
  return targetUrl.href;
}

/**
 * Chuẩn hoá URL an toàn không ném ngoại lệ khi URL rác, dùng để sinh key kiểm tra trùng IP.
 *
 * @param {string} input Chuỗi URL thô.
 * @return {string} URL đã chuẩn hoá hoặc chuỗi đã trim nếu không parse được.
 */
export function safeNormalizeUrl(input) {
  if (!input) return '';
  try {
    return normalizeUrl(input);
  } catch {
    return String(input).trim();
  }
}

function withCredentials(server, username, password) {
  const proxy = { server };
  if (username) proxy.username = username;
  if (password) proxy.password = password;
  return proxy;
}

/**
 * Phân tích một dòng proxy thành cấu hình Playwright.
 *
 * Nhận các format của bản PC (Config/Proxy): scheme://[user:pass@]host:port,
 * host:port, host:port:user:pass, host:port|user|pass và host:port|phút|reset-url.
 * Từ chối rõ ràng SSH proxy và API key provider vì bản Mac không dựng tunnel và
 * không gọi API provider.
 *
 * @param {string} line Một URL proxy hoặc host:port|username|password.
 * @param {number} lineNumber Số dòng để hiển thị lỗi nhập liệu.
 * @param {string} proxyType Scheme mặc định cho dòng chỉ có host:port.
 * @return {{server: string, username?: string, password?: string}|null} Cấu hình proxy hoặc null nếu dòng trống.
 * @throws {Error} Khi proxy không đúng định dạng được hỗ trợ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function parseProxyLine(line, lineNumber, proxyType = 'socks5') {
  const value = line.trim();
  if (!value || value.startsWith('#')) return null;

  // Phải neo scheme ở đầu dòng: format host:port|phút|reset-url cũng chứa "://".
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const proxyUrl = new URL(value);
    if (!['socks5:', 'http:', 'https:'].includes(proxyUrl.protocol) || !proxyUrl.hostname || !proxyUrl.port) {
      throw new Error(`Dòng ${lineNumber}: URL proxy phải dùng socks5://, http:// hoặc https:// và có cổng.`);
    }
    return withCredentials(
      `${proxyUrl.protocol === 'https:' ? 'http:' : proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`,
      proxyUrl.username ? decodeURIComponent(proxyUrl.username) : undefined,
      proxyUrl.password ? decodeURIComponent(proxyUrl.password) : undefined,
    );
  }

  const colonCredentials = value.match(/^([^:|]+):(\d{1,5}):([^:|]+):(.+)$/);
  if (colonCredentials) {
    const [, host, proxyPort, username, password] = colonCredentials;
    if (Number(proxyPort) < 1 || Number(proxyPort) > 65535) {
      throw new Error(`Dòng ${lineNumber}: port proxy phải nằm trong khoảng 1-65535.`);
    }
    return withCredentials(`${proxyType}://${host}:${proxyPort}`, username, password);
  }

  const fields = value.split('|');
  const [hostAndPort, username, ...passwordParts] = fields;
  const separator = hostAndPort.lastIndexOf(':');
  const host = hostAndPort.slice(0, separator);
  const proxyPort = hostAndPort.slice(separator + 1);

  if (separator < 1 || !/^\d{1,5}$/.test(proxyPort) || Number(proxyPort) < 1 || Number(proxyPort) > 65535) {
    if (fields.length >= 4) {
      throw new Error(
        `Dòng ${lineNumber}: đây là SSH proxy (host|user|pass|country) — phải tự mở tunnel ` +
          '(ssh -D) rồi khai báo 127.0.0.1:<port>, bản Mac không dựng tunnel.',
      );
    }
    if (fields.length === 1) {
      throw new Error(
        `Dòng ${lineNumber}: "${hostAndPort}" không có cổng — IP trần thì thêm ":port", còn nếu là ` +
          'API key provider (tinsoft/Socks4G) thì phải gọi API provider để lấy proxy trước.',
      );
    }
    throw new Error(`Dòng ${lineNumber}: dùng host:port, host:port|user|pass hoặc socks5://user:pass@host:port.`);
  }

  const server = `${proxyType}://${host}:${proxyPort}`;

  // host:port|<phút>|<reset url> của proxyHung.txt: trường 2 là chu kỳ xoay, không phải username.
  if (passwordParts.length === 1 && /^\d+$/.test(username ?? '') && /^https?:\/\//.test(passwordParts[0])) {
    return { server, rotateMinutes: Number(username), resetUrl: passwordParts[0] };
  }

  const password = passwordParts.join('|');
  return withCredentials(server, username, password || undefined);
}

/** Playwright chỉ nhận server/username/password, bỏ các field riêng của bản PC. */
function toPlaywrightProxy({ server, username, password }) {
  return withCredentials(server, username, password);
}

/**
 * Tự động đổi IP cho proxy nếu có resetUrl (định dạng của proxyHung, proxy xoay: host:port|phút|resetUrl).
 * Gửi HTTP GET đến resetUrl và chờ IP mới cập nhật trước khi mở trình duyệt.
 *
 * @param {object} proxy Cấu hình proxy.
 * @return {Promise<boolean>} True nếu gọi reset thành công.
 */
export async function rotateProxyIfNeeded(proxy) {
  if (!proxy || !proxy.resetUrl) return false;
  console.log(`[ProxyRotate] Gọi reset URL đổi IP cho ${proxy.server}: ${proxy.resetUrl}`);
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const response = await fetch(proxy.resetUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const resultText = (await response.text()).trim();
    console.log(`[ProxyRotate] Phản hồi reset URL (${response.status}):`, resultText);
    // Chờ 3.5s để proxy provider hoàn tất xoay IP mới
    await new Promise((resolve) => setTimeout(resolve, 3500));
    return true;
  } catch (error) {
    console.warn(`[ProxyRotate] Lỗi gọi reset URL ${proxy.resetUrl}: ${error.message}`);
    return false;
  }
}

/**
 * Đọc danh sách proxy từ giao diện và kiểm tra giới hạn số lượng.
 *
 * @param {string} proxyList Danh sách proxy nhiều dòng.
 * @param {string} proxyType Scheme mặc định cho dòng chỉ có host:port.
 * @param {*} requestedCount Số cửa sổ người dùng nhập, bỏ trống thì lấy hết.
 * @return {object[]} Danh sách proxy đã chọn.
 * @throws {Error} Khi danh sách rỗng hoặc số cửa sổ không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
export function selectProxies(proxyList, proxyType, requestedCount) {
  if (!['socks5', 'http'].includes(proxyType)) throw new Error('Loại proxy phải là socks5 hoặc http.');

  const wanted = requestedCount === undefined || requestedCount === '' ? Infinity : Number(requestedCount);
  if (wanted !== Infinity && (!Number.isInteger(wanted) || wanted < 1)) {
    throw new Error('Số cửa sổ phải là số nguyên lớn hơn 0.');
  }

  // Chỉ phân tích tới khi đủ số cửa sổ cần: một dòng sai ở dưới không được chặn cả lệnh.
  const proxies = [];
  for (const [index, line] of (proxyList ?? '').split(/\r?\n/).entries()) {
    if (proxies.length >= wanted) break;
    const proxy = parseProxyLine(line, index + 1, proxyType);
    if (proxy) proxies.push(proxy);
  }

  if (proxies.length === 0) throw new Error('Danh sách proxy không có dòng nào hợp lệ.');
  if (wanted !== Infinity && proxies.length < wanted) {
    throw new Error(`Bạn nhập ${wanted} cửa sổ nhưng danh sách chỉ có ${proxies.length} proxy hợp lệ.`);
  }
  return proxies;
}

/**
 * Chia lưới vị trí cửa sổ cho N phiên trên màn hình hiện tại.
 *
 * @param {number} index Thứ tự cửa sổ, tính từ 0.
 * @param {number} total Tổng số cửa sổ.
 * @param {{width: number, height: number}} screen Kích thước màn hình.
 * @return {{left: number, top: number, width: number, height: number}} Ô lưới.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
export function tileAt(index, total, screen) {
  const columns = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / columns);
  const cellWidth = Math.floor(screen.width / columns);
  const cellHeight = Math.floor(screen.height / rows);
  // Giới hạn cửa sổ đơn lẻ và căn giữa trong mỗi ô để các profile dùng chung màn hình.
  const width = Math.min(maximumWindow.width, Math.max(minimumWindow.width, cellWidth));
  const height = Math.min(maximumWindow.height, Math.max(minimumWindow.height, cellHeight));
  const cellLeft = (index % columns) * cellWidth;
  const cellTop = Math.floor(index / columns) * cellHeight;
  return {
    width,
    height,
    left: Math.max(0, Math.min(cellLeft + Math.floor((cellWidth - width) / 2), screen.width - width)),
    top: Math.max(0, Math.min(cellTop + Math.floor((cellHeight - height) / 2), screen.height - height)),
  };
}

/**
 * Đọc kích thước màn hình qua Finder để chia lưới cửa sổ.
 *
 * @return {Promise<{width: number, height: number}>} Kích thước màn hình.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
async function readScreenSize() {
  try {
    const { stdout } = await executeFile('osascript', [
      '-e',
      'tell application "Finder" to get bounds of window of desktop',
    ]);
    const [, , width, height] = stdout.split(',').map((part) => Number(part.trim()));
    if (width > 0 && height > 0) {
      return { width, height: Math.max(minimumWindow.height, height - bottomInset) };
    }
  } catch {
    // Finder không trả lời (chưa cấp quyền Automation chẳng hạn) thì dùng mặc định.
  }
  return { ...fallbackScreen, height: fallbackScreen.height - bottomInset };
}

/**
 * Đọc danh sách user-agent macOS đi kèm, chuyển từ Config/Browser/useragent Mac.txt.
 *
 * @return {Promise<string[]>} Danh sách user-agent, rỗng nếu không đọc được file.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
async function readUserAgents() {
  try {
    const content = await readFile(userAgentListPath, 'utf8');
    return content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('Mozilla/'));
  } catch {
    return [];
  }
}

/**
 * Gửi phản hồi JSON cho giao diện.
 *
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @param {number} statusCode Mã trạng thái HTTP.
 * @param {object} responseBody Dữ liệu JSON phản hồi.
 * @return {void} Không trả về giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
function respondWithJson(response, statusCode, responseBody) {
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(responseBody));
}

/**
 * Đọc nội dung yêu cầu POST giới hạn tối đa 1 MB.
 *
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @return {Promise<string>} Nội dung yêu cầu dạng chuỗi.
 * @throws {Error} Khi yêu cầu vượt giới hạn kích thước.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let requestBody = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      requestBody += chunk;
      if (requestBody.length > 50_000_000) {
        reject(new Error('Dữ liệu yêu cầu vượt quá giới hạn 50 MB.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(requestBody));
    request.on('error', reject);
  });
}

/**
 * Mở một cửa sổ Chromium độc lập qua proxy và điều hướng tới website đích.
 *
 * @param {object} options Tham số mở cửa sổ.
 * @return {Promise<string>} Trạng thái mở cửa sổ.
 * @throws {Error} Khi Chromium không khởi chạy được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
async function openBrowserThroughProxy({
  proxy,
  websiteUrl,
  browserNumber,
  tile,
  userAgents,
  language,
  withBookmarks,
}) {
  const browser = await chromium.launch({
    headless: false,
    proxy: toPlaywrightProxy(proxy),
    args: tile
      ? [`--window-position=${tile.left},${tile.top}`, `--window-size=${tile.width},${tile.height}`]
      : [],
  });
  activeBrowsers.add(browser);
  browser.on('disconnected', () => activeBrowsers.delete(browser));

  // viewport: null để cửa sổ thật quyết định khung nhìn, nếu không Playwright ép 1280x720.
  const context = await browser.newContext({
    viewport: null,
    locale: language,
    ...(userAgents.length > 0 && { userAgent: userAgents[Math.floor(Math.random() * userAgents.length)] }),
  });
  const page = await context.newPage();

  let result;
  try {
    await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    result = `Cửa sổ ${browserNumber}: đã mở website qua ${proxy.server}.`;
  } catch (error) {
    result = `Cửa sổ ${browserNumber}: đã mở nhưng website không tải được (${error.message.split('\n')[0]}).`;
  }

  if (withBookmarks) {
    for (const url of bookmarks) {
      const tab = await context.newPage();
      await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: navigationTimeout }).catch(() => {});
    }
  }
  return result;
}

/**
 * Xác minh IP thoát qua chính phiên trình duyệt, lưu IP và loại IP đã dùng.
 *
 * @param {object} browser Phiên Playwright có phương thức newPage().
 * @param {Set<string>} usedExitIps Những IP đã ghi trong lịch sử và lượt hiện tại.
 * @param {(ip: string) => Promise<void>} onExitIp Lưu IP vào lịch sử trước khi dùng.
 * @param {string} [websiteUrl=''] URL trang đích để phân tách phạm vi IP đã dùng.
 * @return {Promise<string>} IP thoát đã xác minh.
 * @throws {IpVerificationError|Error} Khi dịch vụ IP lỗi hoặc IP đã dùng cho trang đích này.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export async function verifyBrowserExitIp(browser, usedExitIps, onExitIp, websiteUrl = '', checkDuplicate = true) {
  const ipPage = await browser.newPage();
  let exitIp;
  const failures = [];
  try {
    for (const checkUrl of browserIpCheckUrls) {
      try {
        const response = await ipPage.goto(checkUrl, {
          waitUntil: 'domcontentloaded',
          timeout: 8_000,
        });
        if (!response || response.status() < 200 || response.status() >= 300) {
          throw new IpVerificationError(
            `trả HTTP ${response?.status() ?? 'không có phản hồi'}`,
          );
        }
        const bodyText = await ipPage.evaluate(() => document.body?.innerText || '').catch(() => '');
        let ipResponse = null;
        try {
          ipResponse = JSON.parse(bodyText);
        } catch {
          const match = bodyText.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
          if (match) ipResponse = { ip: match[0] };
        }
        if (typeof ipResponse?.ip !== 'string' || !ipResponse.ip.trim()) {
          throw new IpVerificationError('không trả địa chỉ IP');
        }
        exitIp = ipResponse.ip.trim();
        break;
      } catch (error) {
        const errMsg = error.message || '';
        const reason = error instanceof IpVerificationError
          ? error.message
          : (errMsg.includes('Timeout') ? 'timeout quá 8s' : 'không kết nối được');
        failures.push(`${new URL(checkUrl).host}: ${reason}`);

        // Fast-fail: Nếu proxy chết hẳn ở tầng mạng/kết nối, dừng ngay không thử các URL tiếp theo
        const isProxyDead = /ERR_PROXY_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED|ERR_SOCKS_CONNECTION_FAILED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_NAME_NOT_RESOLVED|ERR_TIMED_OUT|ECONNREFUSED|EHOSTUNREACH/i.test(errMsg);
        if (isProxyDead) {
          break;
        }
      }
    }
    if (!exitIp) {
      throw new IpVerificationError(
        `Tất cả dịch vụ xác minh IP đều lỗi (${failures.join(' | ')}).`,
      );
    }
  } finally {
    await ipPage.close().catch(() => {});
  }
  await onExitIp(exitIp);
  // Kiểm tra xung đột IP đồng thời: tuyệt đối không mở 2 cửa sổ có cùng exit IP cùng một thời điểm
  if (isExitIpCurrentlyInUse(exitIp)) {
    throw new Error(`IP ${exitIp} đang được sử dụng ở một cửa sổ khác; tránh mở trùng đồng thời.`);
  }
  const normUrl = websiteUrl ? safeNormalizeUrl(websiteUrl) : '';
  const keyWithUrl = normUrl ? `${exitIp}::${normUrl}` : exitIp;
  if (checkDuplicate && usedExitIps.has(keyWithUrl)) {
    throw new Error(`IP ${exitIp} đã được dùng trước đây cho trang đích này`);
  }
  activeExitIpLocks.add(exitIp);
  usedExitIps.add(keyWithUrl);
  return exitIp;
}

/**
 * Sinh khóa ổn định cho proxy, giữ các dòng trùng nhau thành mục lịch sử riêng.
 *
 * @param {object} proxy Cấu hình proxy đã phân tích.
 * @param {number} occurrence Thứ tự xuất hiện của cấu hình giống hệt trong danh sách.
 * @param {string} [websiteUrl=''] URL trang đích tương ứng nếu có.
 * @return {string} Khóa băm không chứa thông tin đăng nhập dạng rõ.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export function createProxyUsageKey(proxy, occurrence, websiteUrl = '') {
  const normUrl = websiteUrl ? safeNormalizeUrl(websiteUrl) : '';
  const identity = normUrl ? `${proxyIdentity(proxy)}|${normUrl}` : proxyIdentity(proxy);
  const proxyHash = createHash('sha256').update(identity).digest('hex');
  return `${proxyHash}:${occurrence}`;
}

/**
 * Cho phép thử lại các proxy chỉ thất bại vì không xác minh được IP thoát.
 *
 * Bản ghi cũ trước khi có trạng thái `verification_error` được nhận diện qua thông báo
 * của bước IP; các lỗi proxy, website và profile khác tiếp tục bị loại vĩnh viễn.
 *
 * @param {object|undefined} historyRecord Bản ghi lịch sử của proxy.
 * @return {boolean} True nếu proxy chưa được xác minh và có thể thử lại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
function isRetryableIpVerificationFailure(historyRecord) {
  if (!historyRecord) return false;
  if (historyRecord.status === 'verification_error') return !historyRecord.exitIp;
  if (historyRecord.status !== 'failed' || historyRecord.exitIp) return false;

  const reason = String(historyRecord.reason ?? '');
  return reason.startsWith('không lấy được IP qua trình duyệt');
}

/**
 * Gom các IP exit đã dùng từ lịch sử proxy để hiện trong giao diện.
 *
 * Mỗi IP một dòng, giữ lần dùng mới nhất và đếm số lần xuất hiện; bản ghi chưa có IP bị bỏ
 * qua vì chưa tiêu IP nào. Đây chính là tập IP mà lượt mở sau sẽ từ chối dùng lại.
 *
 * @param {object} usageHistory Lịch sử proxy đã đọc từ đĩa.
 * @return {{exitIp: string, proxy: string, status: string, usedAt: string, uses: number}[]} Danh sách IP, mới nhất trước.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
export function buildUsedExitIpList(usageHistory) {
  const byIp = new Map();
  for (const record of Object.values(usageHistory?.proxies ?? {})) {
    if (!record?.exitIp) continue;
    const usedAt = record.completedAt ?? record.attemptedAt ?? '';
    const existing = byIp.get(record.exitIp);
    if (existing && existing.usedAt >= usedAt) {
      existing.uses += 1;
      continue;
    }
    byIp.set(record.exitIp, {
      exitIp: record.exitIp,
      proxy: record.proxy ?? '',
      status: record.status ?? '',
      usedAt,
      uses: (existing?.uses ?? 0) + 1,
    });
  }
  return [...byIp.values()].sort((left, right) => right.usedAt.localeCompare(left.usedAt));
}

/**
 * Danh tính ổn định của proxy để tra lịch sử sử dụng.
 *
 * Không tính password vì một số provider xoay password theo phiên.
 *
 * @param {object} proxy Cấu hình proxy đã phân tích.
 * @return {string} Chuỗi danh tính ổn định giữa các lần chạy.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
function proxyIdentity(proxy) {
  return JSON.stringify([proxy.server, proxy.username ?? '']);
}

/**
 * Đọc lịch sử proxy đã thử để không dùng lại proxy thành công hoặc thất bại.
 *
 * @return {Promise<{version: number, proxies: Record<string, object>}>} Lịch sử proxy đã dùng.
 * @throws {Error} Khi file lịch sử bị hỏng hoặc không thể đọc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
async function readProxyUsageHistory() {
  let history;
  try {
    history = JSON.parse(await readFile(proxyUsageHistoryPath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, proxies: {} };
    throw new Error(`Không đọc được lịch sử proxy đã dùng: ${error.message}`);
  }
  if (history?.version !== 1 || !history.proxies || typeof history.proxies !== 'object') {
    throw new Error('File lịch sử proxy không đúng định dạng; dừng mở để tránh dùng lại IP cũ.');
  }
  return history;
}

/**
 * Ghi lịch sử proxy theo cách nguyên tử và giới hạn quyền file cho tài khoản hiện tại.
 *
 * @param {{version: number, proxies: Record<string, object>}} history Lịch sử cần lưu.
 * @return {Promise<void>} Hoàn tất khi lịch sử đã được thay thế trên đĩa.
 * @throws {Error} Khi không thể lưu lịch sử proxy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
async function writeProxyUsageHistory(history) {
  await mkdir(dirname(proxyUsageHistoryPath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${proxyUsageHistoryPath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(history, null, 2), { encoding: 'utf8', mode: 0o600 });
  await rename(temporaryPath, proxyUsageHistoryPath);
}

/**
 * Tuần tự lưu lịch sử dùng chung để các worker không ghi đè snapshot của nhau.
 *
 * @param {object} history Lịch sử proxy đã thử.
 * @return {Promise<void>} Hoàn tất khi lịch sử đã được lưu.
 * @throws {Error} Khi không thể ghi lịch sử xuống đĩa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
function persistProxyUsageHistory(history) {
  const result = proxyHistoryWriteQueue.then(() => writeProxyUsageHistory(history));
  proxyHistoryWriteQueue = result.catch(() => {});
  return result;
}

/**
 * Tạo CSV từ sổ proxy đã thử để người dùng lưu báo cáo kết nối qua nhiều phiên.
 *
 * Báo cáo chỉ phản ánh trạng thái mở trang và IP exit do app ghi nhận; nó không đánh dấu
 * trạng thái chuyển đổi hoặc hoàn tất offer.
 *
 * @param {{version: number, proxies: Record<string, object>}} history Sổ lịch sử proxy.
 * @return {string} Nội dung CSV UTF-8 không chứa thông tin đăng nhập proxy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
export function buildProxyUsageHistoryCsv(history) {
  const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const records = Object.values(history.proxies)
    .sort((left, right) => String(left.attemptedAt ?? '').localeCompare(String(right.attemptedAt ?? '')));
  return [
    ['proxy', 'trang_thai', 'ip_exit', 'offer_so', 'website', 'url_cuoi', 'profile_id', 'bat_dau', 'ket_thuc', 'ghi_chu']
      .map(csvCell).join(','),
    ...records.map((record) => [
      record.proxy,
      record.status,
      record.exitIp,
      record.offerNumber ?? record.streamRole ?? 1,
      record.websiteUrl,
      record.finalUrl,
      record.profileId,
      record.attemptedAt,
      record.completedAt,
      record.reason,
    ].map(csvCell).join(',')),
  ].join('\n');
}

/** Fingerprint ổn định cho một bản ghi autofill (không phụ thuộc thứ tự key). */
function autofillRecordKey(record) {
  return JSON.stringify(Object.fromEntries(Object.entries(record).sort()));
}

/** Nạp danh sách bản ghi đã dùng từ file. */
async function loadAutofillUsed() {
  try {
    const data = JSON.parse(await readFile(autofillUsedPath, 'utf8'));
    autofillUsedKeys = new Set(Array.isArray(data.keys) ? data.keys : []);
  } catch { /* file chưa tồn tại */ }
}

/** Ghi thêm một bản ghi vào danh sách đã dùng. */
async function markAutofillRecordUsed(record) {
  autofillUsedKeys.add(autofillRecordKey(record));
  await writeFile(autofillUsedPath, JSON.stringify({ keys: [...autofillUsedKeys] })).catch(() => {});
}

/** Nạp hàng đợi autofill từ file. */
async function loadAutofillQueue() {
  await seedFileIfMissing(autofillQueuePath, 'autofill-queue.json');
  try {
    const data = JSON.parse(await readFile(autofillQueuePath, 'utf8'));
    autofillQueue.available = Array.isArray(data.available) ? data.available : [];
    autofillQueue.used = Array.isArray(data.used) ? data.used : [];
  } catch { /* file chưa tồn tại */ }
}

/** Lưu hàng đợi autofill xuống file. */
async function saveAutofillQueue() {
  await writeFile(autofillQueuePath, JSON.stringify(autofillQueue)).catch(() => {});
}

/**
 * Thêm các record mới từ danh sách vào available, bỏ qua record đã có.
 * @param {object[]} records Danh sách record đã parse.
 * @return {number} Số record mới được thêm.
 */
function importAutofillRecords(records) {
  const existingKeys = new Set([
    ...autofillQueue.available.map(autofillRecordKey),
    ...autofillQueue.used.map(autofillRecordKey),
  ]);
  let added = 0;
  for (const record of records) {
    const key = autofillRecordKey(record);
    if (!existingKeys.has(key)) {
      autofillQueue.available.push(record);
      existingKeys.add(key);
      added++;
    }
  }
  return added;
}

/** Nạp hàng đợi proxy từ file. */
async function loadProxyQueue() {
  await seedFileIfMissing(proxyQueuePath, 'proxy-queue.json');
  try {
    const data = JSON.parse(await readFile(proxyQueuePath, 'utf8'));
    proxyQueue.available = Array.isArray(data.available) ? data.available : [];
    proxyQueue.used = Array.isArray(data.used) ? data.used : [];
  } catch { /* file chưa tồn tại */ }
}

/** Lưu hàng đợi proxy xuống file. */
async function saveProxyQueue() {
  await writeFile(proxyQueuePath, JSON.stringify(proxyQueue)).catch(() => {});
}

/**
 * Xóa toàn bộ proxy trong hàng đợi (cả available và used), làm sạch lịch sử và state liên quan.
 * @return {Promise<{success: boolean, available: number, used: number, count: number, message: string}>}
 */
export async function clearAllProxyQueue() {
  const count = proxyQueue.available.length + proxyQueue.used.length;
  proxyQueue.available.length = 0;
  proxyQueue.used.length = 0;
  await saveProxyQueue();
  resetMultiOfferState();
  await saveDualStreamState();
  try {
    const history = await readProxyUsageHistory();
    history.proxies = {};
    await persistProxyUsageHistory(history);
  } catch {}
  return {
    success: true,
    available: 0,
    used: 0,
    count,
    message: `Đã xóa hết tất cả ${count} proxy trong hàng đợi. Bạn có thể thêm proxy mới.`,
  };
}

/**
 * Thêm các dòng proxy mới từ textarea vào available, bỏ qua dòng đã có trong available hoặc used.
 * @param {string[]} rawLines Các dòng proxy thô.
 * @param {string} proxyType Scheme mặc định.
 * @return {number} Số dòng mới được thêm vào.
 */
function pruneStaleAgents() {
  const cutoff = Date.now() - 60_000;
  for (const [id, a] of remoteAgents) {
    if (a.lastSeen < cutoff) remoteAgents.delete(id);
  }
}

function dispatchOneTaskToAgent(agent, settings) {
  if (proxyQueue.available.length === 0) return false;
  const proxyLine = proxyQueue.available.shift();
  proxyQueue.used.push(proxyLine);
  void saveProxyQueue();
  if (proxyQueue.available.length === 0) void autoRefillProxyIfNeeded();
  const record = autofillQueue.available.shift() ?? {};
  if (record && Object.keys(record).length > 0) {
    autofillQueue.used.push(record);
    void saveAutofillQueue();
  }
  const chosenProfile = getNextDeviceProfile();
  pendingAgentTasks.push({
    taskId: randomUUID(),
    proxy: proxyLine,
    proxyType: settings.proxyType ?? 'socks5',
    record,
    websiteUrl: settings.websiteUrl,
    autoSubmitForm: settings.autoSubmitForm ?? true,
    deviceProfile: chosenProfile,
    leadConfig: {
      enabled: settings.enableLeadCheck !== false,
      checkScreen: Number(settings.leadCheckScreen) || DEFAULT_LEAD_CONFIG.checkScreen || 4,
      apiUrl: settings.leadCheckApiUrl || DEFAULT_LEAD_CONFIG.apiUrl,
      cookie: settings.leadCheckCookie || DEFAULT_LEAD_CONFIG.cookie,
      datas: settings.leadCheckDatas || DEFAULT_LEAD_CONFIG.datas,
      intervalSeconds: Number(settings.leadCheckInterval) || DEFAULT_LEAD_CONFIG.intervalSeconds,
      maxAttempts: Number(settings.leadCheckMaxAttempts) || DEFAULT_LEAD_CONFIG.maxAttempts,
    },
    createdAt: Date.now(),
  });
  agent.freeSlots = Math.max(0, agent.freeSlots - 1);
  agent.activeTasks++;
  return true;
}

function importProxyLines(rawLines, proxyType) {
  const existingAll = new Set([...proxyQueue.available, ...proxyQueue.used]);
  let added = 0;
  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    try { parseProxyLine(trimmed, 1, proxyType); } catch { continue; } // validate
    if (!existingAll.has(trimmed)) {
      proxyQueue.available.push(trimmed);
      existingAll.add(trimmed);
      added++;
    }
  }
  return added;
}

/** Nạp hàng đợi email mẫu từ file. */
export async function loadEmailQueue() {
  await seedFileIfMissing(emailQueuePath, 'email-queue.json');
  try {
    const data = JSON.parse(await readFile(emailQueuePath, 'utf8'));
    emailQueue.available = Array.isArray(data.available) ? data.available : [];
    emailQueue.used = Array.isArray(data.used) ? data.used : [];
  } catch { /* file chưa tồn tại */ }
}

/** Lưu hàng đợi email mẫu xuống file. */
export async function saveEmailQueue() {
  await writeFile(emailQueuePath, JSON.stringify(emailQueue)).catch(() => {});
}

/** Nạp config auto-refill từ file. */
export async function loadEmailAutoRefillConfig() {
  try {
    const data = JSON.parse(await readFile(emailAutoRefillConfigPath, 'utf8'));
    if (typeof data.enabled === 'boolean') emailAutoRefill.enabled = data.enabled;
    if (typeof data.sourcePath === 'string') emailAutoRefill.sourcePath = data.sourcePath;
    if (typeof data.batchSize === 'number') emailAutoRefill.batchSize = data.batchSize;
    if (typeof data.byteOffset === 'number') emailAutoRefill.byteOffset = data.byteOffset;
  } catch { /* chưa có config */ }
}

/** Lưu config auto-refill xuống file. */
export async function saveEmailAutoRefillConfig() {
  await writeFile(emailAutoRefillConfigPath, JSON.stringify(emailAutoRefill)).catch(() => {});
}

/** Đọc batch email từ file nguồn bắt đầu tại byteOffset, trả về emails và offset mới. */
async function readEmailBatchFromSource(filePath, byteOffset, batchSize) {
  const { createReadStream } = await import('fs');
  const { createInterface } = await import('readline');
  const existingAll = new Set([...emailQueue.available, ...emailQueue.used]);
  const emails = [];
  let bytesConsumed = 0;
  let done = false;
  await new Promise((resolve) => {
    const stream = createReadStream(filePath, { start: byteOffset, encoding: 'utf8' });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    rl.on('line', (line) => {
      if (emails.length >= batchSize) { done = true; rl.close(); return; }
      const raw = line.trim();
      bytesConsumed += Buffer.byteLength(line, 'utf8') + 1;
      const email = parseEmailLine(raw);
      if (email && !existingAll.has(email)) { emails.push(email); existingAll.add(email); }
    });
    rl.on('close', () => resolve());
    stream.on('error', () => resolve());
  });
  return { emails, newByteOffset: byteOffset + bytesConsumed };
}

/** Tự động nạp thêm email từ file nguồn khi hàng đợi cạn. Gọi bất đồng bộ, không block. */
export async function autoRefillEmailIfNeeded() {
  if (!emailAutoRefill.enabled || !emailAutoRefill.sourcePath) return;
  if (emailQueue.available.length > 0) return;
  try {
    const { emails, newByteOffset } = await readEmailBatchFromSource(
      emailAutoRefill.sourcePath, emailAutoRefill.byteOffset, emailAutoRefill.batchSize
    );
    if (emails.length === 0) {
      console.log('[EmailAutoRefill] Đã đọc hết file nguồn.');
      return;
    }
    emailQueue.available.push(...emails);
    emailAutoRefill.byteOffset = newByteOffset;
    await saveEmailQueue();
    await saveEmailAutoRefillConfig();
    console.log(`[EmailAutoRefill] Đã nạp thêm ${emails.length} email từ file nguồn.`);
  } catch (e) {
    console.log('[EmailAutoRefill] Lỗi đọc file nguồn:', e.message);
  }
}

/**
 * Trích xuất email hợp lệ từ một dòng văn bản.
 * Hỗ trợ định dạng email đơn thuần hoặc email đi kèm mật khẩu, pipe (|), dấu phẩy.
 *
 * @param {string} line Dòng dữ liệu thô.
 * @return {string|null} Địa chỉ email viết thường hoặc null nếu không hợp lệ.
 */
export function parseEmailLine(line) {
  const trimmed = String(line || '').trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const match = trimmed.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Thêm các dòng email mới vào available, bỏ qua email đã có trong available hoặc used.
 * @param {string[]} rawLines Các dòng email thô.
 * @return {number} Số email mới được thêm vào.
 */
export function importEmailLines(rawLines) {
  const existingAll = new Set([...emailQueue.available, ...emailQueue.used]);
  let added = 0;
  for (const line of rawLines) {
    const email = parseEmailLine(line);
    if (email && !existingAll.has(email)) {
      emailQueue.available.push(email);
      existingAll.add(email);
      added++;
    }
  }
  return added;
}

/**
 * Lấy ra email mẫu tiếp theo từ hàng đợi.
 * Nếu hết available nhưng còn used, tự động quay vòng danh sách đã dùng để phiên không bị gián đoạn.
 * @return {string|null} Email được gán cho phiên hoặc null nếu rỗng.
 */
export function dequeueNextEmail() {
  if (emailQueue.available.length === 0 && emailQueue.used.length > 0 && !emailAutoRefill.enabled) {
    console.log('[EmailQueue] Hàng đợi email mẫu đã hết, tự động quay vòng danh sách đã dùng.');
    emailQueue.available.push(...emailQueue.used.splice(0));
    void saveEmailQueue();
  }
  if (emailQueue.available.length === 0) {
    void autoRefillEmailIfNeeded();
    return null;
  }
  const email = emailQueue.available.shift();
  emailQueue.used.push(email);
  void saveEmailQueue();
  if (emailQueue.available.length === 0) void autoRefillEmailIfNeeded();
  return email;
}

/** Khởi tạo email queue: nếu trống, tự động nạp từ các file mẫu có sẵn trên máy. */
export async function initializeEmailQueue() {
  await loadEmailQueue();
  if (emailQueue.available.length === 0 && emailQueue.used.length === 0) {
    const defaultCandidates = [
      join(homedir(), 'Downloads', '1kpart2.txt'),
      join(homedir(), 'Downloads', 'AutoLeadPC', 'Text', 'Gmail.txt'),
    ];
    for (const cand of defaultCandidates) {
      try {
        const text = await readFile(cand, 'utf8');
        const lines = text.split(/\r?\n/);
        const added = importEmailLines(lines);
        if (added > 0) {
          console.log(`[EmailQueue] Đã tự động nạp ${added} email từ ${cand}`);
          await saveEmailQueue();
          break;
        }
      } catch {}
    }
  }
}

/**
 * Chạy handler trên từng phần tử nhưng không vượt quá mức đồng thời cho trước.
 *
 * @param {Array} items Danh sách phần tử cần xử lý.
 * @param {number} limit Số tác vụ chạy song song tối đa.
 * @param {Function} handler Hàm xử lý một phần tử, nhận (item, index).
 * @return {Promise<Array>} Kết quả theo đúng thứ tự đầu vào.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-09
 */
export async function mapWithLimit(items, limit, handler) {
  const results = new Array(items.length);
  let nextIndex = 0;
  // ponytail: pool tối giản, đủ cho vài chục dòng proxy; thay bằng thư viện nếu cần hàng nghìn.
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await handler(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

let exclusiveQueue = Promise.resolve();

/**
 * Xếp một thao tác vào hàng đợi chung để tránh ghi đè trạng thái profile.
 *
 * @param {Function} handler Thao tác cần chạy.
 * @param {string} requestBody Nội dung yêu cầu truyền cho thao tác.
 * @return {Promise<object>} Kết quả thao tác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
function enqueueExclusively(handler, requestBody = '') {
  const result = exclusiveQueue.then(() => handler(requestBody));
  exclusiveQueue = result.catch(() => {});
  return result;
}

/**
 * Bọc một handler để các yêu cầu dùng chung hàng đợi profile.
 *
 * @param {Function} handler Handler cần xếp hàng.
 * @return {Function} Handler đã xếp hàng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
const runExclusively = (handler) => (requestBody) => enqueueExclusively(handler, requestBody);

/**
 * Ghi nhận proxy trước khi thử, bỏ proxy đã dùng, tự thay proxy lỗi và lưu kết quả từng IP.
 * Dừng lượt và tạm tắt tự bù nếu dịch vụ xác minh IP không hoạt động.
 *
 * @param {string} requestBody Nội dung JSON nhận từ giao diện.
 * @param {{layoutTarget?: number}} options Vị trí ô hiển thị các cửa sổ Chrome.
 * @return {Promise<{results: string[], warnings: string[]}>} Kết quả proxy thành công/thất bại và cảnh báo.
 * @throws {Error} Khi cấu hình không hợp lệ hoặc sổ proxy không đọc/ghi được.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
async function launchRequestedBrowsers(requestBody, { layoutTarget = null, assignedStreamRoles = null } = {}) {
  const body = JSON.parse(requestBody);
  if (templateProfileContext) {
    throw new Error('Hãy đóng cửa sổ profile mẫu RoboForm trước khi tạo profile Chrome mới.');
  }

  const scriptPath    = body.scriptPath    ?? '';
  const captchaApiKey = body.captchaApiKey ?? '';
  const completeText  = body.completeText  ?? '';
  const timeLimit     = Math.max(0, Number(body.timeLimit)  || 0); // giây
  const delayStart    = Math.max(0, Number(body.delayStart) || 0); // giây
  const delayStop     = Math.max(0, Number(body.delayStop)  || 0); // giây
  const newLimitRun   = Math.max(0, Number(body.limitRun)   || 0);
  if (newLimitRun > 0) limitRunMax = newLimitRun;
  const antiFingerprint = {
    canvas: Boolean(body.antiFpCanvas),
    clientRects: Boolean(body.antiFpClientRects),
    webgl: Boolean(body.antiFpWebgl),
    webrtc: Boolean(body.antiFpWebrtc),
    fonts: Boolean(body.antiFpFonts),
    apiFakeIP: Boolean(body.antiFpApiFakeIP),
  };
  const hideUntilTarget = Boolean(body.hideUntilTarget ?? body.hideBrowser);
  const hideUntilLead = Boolean(body.hideUntilLead);

  let scriptSteps = null;
  if (scriptPath) {
    try {
      scriptSteps = await loadScript(scriptPath);
    } catch (e) {
      console.warn(`[Script] Không đọc được script "${scriptPath}": ${e.message}`);
    }
  }
  const autofillRecords = parseAutofillRecords(body.autofillData);
  // Nạp autofill mới vào queue nếu queue trống
  if (autofillRecords.length > 0 && autofillQueue.available.length === 0 && autofillQueue.used.length === 0) {
    importAutofillRecords(autofillRecords);
    await saveAutofillQueue();
  } else if (autofillRecords.length > 0) {
    // Thêm record mới chưa có trong queue (user cập nhật danh sách)
    const added = importAutofillRecords(autofillRecords);
    if (added > 0) await saveAutofillQueue();
  }
  // Kiểm tra còn đủ record không
  if (autofillRecords.length > 0 && autofillQueue.available.length === 0) {
    return {
      results: [],
      warnings: ['Tất cả thông tin đã được dùng hết. Hãy bấm "Đặt lại" trong tab Proxy để dùng lại.'],
    };
  }

  const proxyType = body.proxyType ?? 'socks5';
  // Nạp proxy mới từ textarea vào queue nếu queue đang trống
  if (proxyQueue.available.length === 0 && body.proxyList) {
    const added = importProxyLines((body.proxyList ?? '').split(/\r?\n/), proxyType);
    if (added > 0) await saveProxyQueue();
  }
  // Nạp email mẫu mới từ textarea vào queue nếu có
  if (body.emailList) {
    const added = importEmailLines((body.emailList ?? '').split(/\r?\n/));
    if (added > 0) await saveEmailQueue();
  }

  // 1. Phân tích danh sách các trang đích (hỗ trợ đa luồng nhiều offer)
  const offerUrls = [];
  if (Array.isArray(body.offerUrls) && body.offerUrls.length > 0) {
    offerUrls.push(...body.offerUrls.map((u) => normalizeUrl(u)).filter(Boolean));
  } else if (Array.isArray(body.offerList) && body.offerList.length > 0) {
    offerUrls.push(...body.offerList.map((u) => normalizeUrl(u)).filter(Boolean));
  } else {
    const rawUrl1 = body.websiteUrl ? String(body.websiteUrl).trim() : '';
    const rawUrl2 = body.websiteUrl2 ? String(body.websiteUrl2).trim() : '';
    if (rawUrl1) {
      if (/[\r\n,;]/.test(rawUrl1)) {
        const parts = rawUrl1.split(/[\r\n,;]+/).map((u) => u.trim()).filter(Boolean);
        for (const p of parts) {
          try {
            const norm = normalizeUrl(p);
            if (!offerUrls.includes(norm)) offerUrls.push(norm);
          } catch {}
        }
      } else {
        try { offerUrls.push(normalizeUrl(rawUrl1)); } catch {}
      }
    }
    if (rawUrl2) {
      try {
        const norm2 = normalizeUrl(rawUrl2);
        if (!offerUrls.includes(norm2)) offerUrls.push(norm2);
      } catch {}
    }
    if (body.websiteUrl3) {
      try {
        const norm3 = normalizeUrl(body.websiteUrl3);
        if (!offerUrls.includes(norm3)) offerUrls.push(norm3);
      } catch {}
    }
    if (body.websiteUrl4) {
      try {
        const norm4 = normalizeUrl(body.websiteUrl4);
        if (!offerUrls.includes(norm4)) offerUrls.push(norm4);
      } catch {}
    }
  }

  let websiteUrl = offerUrls[0] || (body.websiteUrl ? normalizeUrl(body.websiteUrl) : '');
  let websiteUrl2 = offerUrls[1] || (body.websiteUrl2 ? normalizeUrl(body.websiteUrl2) : '');
  const isDualStream = offerUrls.length >= 2;

  const usageHistory = await readProxyUsageHistory();
  // IP được ghi nhận theo từng trang đích (exitIp::websiteUrl) để 1 IP mở được 2 trang đích đồng thời
  const usedExitIps = new Set(
    Object.values(usageHistory.proxies)
      .map((entry) => {
        if (!entry.exitIp) return null;
        if (entry.status !== 'success') return null;
        return entry.websiteUrl ? `${entry.exitIp}::${safeNormalizeUrl(entry.websiteUrl)}` : entry.exitIp;
      })
      .filter(Boolean)
  );

  // Proxy đã dùng không được dùng lại — bấm "Đặt lại hàng đợi" để dùng lại thủ công.

  // Queue là nguồn chính — parse available thành proxy objects, dedup theo server
  const seenServers = new Set();
  const availableProxies = proxyQueue.available.map((line) => {
    try { return { ...parseProxyLine(line.trim(), 1, proxyType), _queueLine: line }; }
    catch { return null; }
  }).filter((proxy) => {
    if (!proxy || seenServers.has(proxy.server)) return false;
    seenServers.add(proxy.server);
    return true;
  });

  // Khởi tạo hoặc cập nhật trạng thái Multi-Offer / Dual Stream khi bắt đầu phiên mới
  const offerCount = Math.max(1, offerUrls.length);
  const offerUrlsKey = offerUrls.join('|');
  const previousUrlsKey = (multiOfferState.offerUrls || []).join('|');
  const urlsChanged = offerUrlsKey !== previousUrlsKey;

  multiOfferState.enabled = offerCount >= 2;
  multiOfferState.offerCount = offerCount;
  multiOfferState.offerUrls = [...offerUrls];

  if (urlsChanged) {
    multiOfferState.offerUsed.clear();
    multiOfferState.offerCursors.clear();
    multiOfferState.offerDirections.clear();
    initMultiOfferCursors(offerCount, availableProxies.length);
    syncDualStreamState(offerCount);
    void saveDualStreamState();
  } else {
    for (let k = 1; k <= offerCount; k++) {
      if (!multiOfferState.offerCursors.has(k) && availableProxies.length > 0) {
        initMultiOfferCursors(offerCount, availableProxies.length);
        break;
      }
    }
    syncDualStreamState(offerCount);
  }

  const countParam = (body.requestedCount !== undefined && body.requestedCount !== '')
    ? body.requestedCount
    : body.concurrency;
  let requestedCount = (countParam !== undefined && countParam !== '')
    ? Number(countParam)
    : (isDualStream ? 2 : Math.min(maxAliveBrowsers, availableProxies.length || 1));
  if (!Number.isInteger(requestedCount) || requestedCount < 1) {
    throw new Error('Số trình duyệt cần mở phải là số nguyên lớn hơn 0.');
  }
  if (isDualStream && requestedCount < 2) {
    requestedCount = 2; // Chạy 2 luồng yêu cầu tối thiểu 2 cửa sổ
  }
  if (requestedCount > maxAliveBrowsers) {
    throw new Error('Chỉ được mở tối đa ' + maxAliveBrowsers + ' cửa sổ trình duyệt cùng lúc.');
  }
  const targetSuccessCount = Math.min(requestedCount, isDualStream ? Math.max(availableProxies.length, requestedCount) : availableProxies.length);
  if (targetSuccessCount === 0 || availableProxies.length === 0) {
    return {
      results: [],
      warnings: [availableProxies.length === 0
        ? 'Hàng đợi proxy trống. Hãy nhập thêm proxy hoặc bấm "Đặt lại hàng đợi" để dùng lại.'
        : 'Không đủ proxy để mở; kiểm tra cấu hình.'],
    };
  }
  const warnings = requestedCount > availableProxies.length
    ? ['Bạn yêu cầu ' + requestedCount + ' trình duyệt nhưng hàng đợi chỉ còn ' + availableProxies.length + ' proxy.']
    : [];
  const alreadyAlive = activeBrowsers.size;
  if (alreadyAlive + targetSuccessCount > maxAliveBrowsers) {
    const room = Math.max(0, maxAliveBrowsers - alreadyAlive);
    throw new Error(
      'Máy này chỉ nên mở tối đa ' + maxAliveBrowsers + ' trình duyệt cùng lúc để không bị treo'
        + (alreadyAlive ? ' (đang mở ' + alreadyAlive + ', còn chỗ cho ' + room + ')' : '')
        + '. Bạn yêu cầu ' + targetSuccessCount + '. Hãy giảm số cửa sổ (hoặc bấm Đóng tất cả trước), '
        + 'hoặc đóng bớt cửa sổ đang mở.',
    );
  }

  const screen = await readScreenSize();
  const layoutCount = layoutTarget ?? Math.min(maxAliveBrowsers, alreadyAlive + targetSuccessCount);
  const occupiedTileIndexes = new Set([...activeBrowsers].map((session) => session.tileIndex));
  const availableTileIndexes = Array.from({ length: layoutCount }, (_, index) => index)
    .filter((index) => !occupiedTileIndexes.has(index));
  const allInstalledBuilds = await listInstalledChromeChannels();
  if (allInstalledBuilds.length === 0) {
    throw new Error('Chưa cài đặt phiên bản Google Chrome nào.');
  }
  const occupiedChromeMajors = new Set([...activeBrowsers]
    .map((session) => Number(session.chromeVersion?.split('.')[0])).filter(Boolean));
  let availableChromeBuilds = allInstalledBuilds
    .filter((build) => !occupiedChromeMajors.has(build.major));
  if (availableChromeBuilds.length > 1) {
    const offset = chromeBuildRotationCounter % availableChromeBuilds.length;
    availableChromeBuilds.push(...availableChromeBuilds.splice(0, offset));
  }
  // Nếu số phiên bản chưa mở ít hơn số lượng cần mở (hoặc các phiên bản đang bận/đang đóng),
  // tự động bổ sung xoay vòng từ danh sách tất cả phiên bản đã cài thay vì báo lỗi chặn đứng tiến trình.
  if (availableChromeBuilds.length < targetSuccessCount) {
    let poolIndex = chromeBuildRotationCounter;
    while (availableChromeBuilds.length < targetSuccessCount) {
      availableChromeBuilds.push(allInstalledBuilds[poolIndex % allInstalledBuilds.length]);
      poolIndex++;
    }
  }
  warnings.push('Các phiên bản Google Chrome thường của lượt này: '
    + availableChromeBuilds.slice(0, targetSuccessCount).map((build) => build.version).join(', ') + '.');

  if (!autoRefill.settings) {
    autoRefill.settings = {
      proxyList: body.proxyList,
      proxyType: proxyType,
      websiteUrl: body.websiteUrl,
      websiteUrl2: websiteUrl2 || body.websiteUrl2,
      websiteUrl3: body.websiteUrl3,
      websiteUrl4: body.websiteUrl4,
      offerUrls,
      checkDuplicate: body.checkDuplicate !== false,
      autofillData: body.autofillData,
      emailList: body.emailList,
      autoSubmitForm: body.autoSubmitForm !== false,
      enableLeadCheck: body.enableLeadCheck !== false,
      leadCheckApiUrl: body.leadCheckApiUrl,
      leadCheckCookie: body.leadCheckCookie,
      leadCheckDatas: body.leadCheckDatas,
      leadCheckInterval: body.leadCheckInterval,
      leadCheckMaxAttempts: body.leadCheckMaxAttempts,
      scriptPath, captchaApiKey, completeText, timeLimit, delayStart, delayStop, limitRun: newLimitRun,
      antiFpCanvas: antiFingerprint.canvas, antiFpClientRects: antiFingerprint.clientRects,
      antiFpWebgl: antiFingerprint.webgl, antiFpWebrtc: antiFingerprint.webrtc,
    };
    if (autoRefill.targetCount < 1) autoRefill.targetCount = targetSuccessCount;
  }
  const results = [];
  let nextProxyIndex = 0;
  let successfulBrowsers = 0;

  /**
   * Thử proxy tiếp theo cho một slot đến khi mở thành công một cửa sổ Chrome.
   *
   * @param {number} workerIndex Chỉ số slot và bản Chrome được giao.
   * @return {Promise<void>} Kết thúc khi slot mở được hoặc hết proxy phù hợp.
   * @throws {Error} Khi không thể ghi lịch sử sử dụng proxy.
   * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
   * @since 2026-10-15
   */
  const attemptProxy = async (workerIndex) => {
    // Giãn cách khởi động giữa các worker (staggered launch) để tránh giật lag CPU và nghẽn mạng
    if (workerIndex > 0) {
      await new Promise((r) => setTimeout(r, Math.min(workerIndex * 800, 4000)));
    }
    const offerCount = Math.max(1, offerUrls.length);
    const offerNumber = assignedStreamRoles?.[workerIndex]
      ?? ((workerIndex % offerCount) + 1);
    const targetUrl = offerUrls[offerNumber - 1] || websiteUrl;
    const streamRole = offerNumber;
    const streamLabel = offerCount > 1 ? `Offer ${offerNumber}` : '';

    while (successfulBrowsers < targetSuccessCount) {
      if (autoRefill.stopRequested || !autoRefill.enabled) {
        console.log(`[attemptProxy] Stop đã được kích hoạt, dừng worker ${workerIndex + 1}.`);
        break;
      }
      // Dừng khi đã đạt giới hạn limitRun (số phiên hoàn tất)
      if (limitRunMax > 0 && limitRunCount >= limitRunMax) {
        console.log(`[limitRun] Đã đạt giới hạn ${limitRunMax} phiên hoàn tất, dừng mở thêm.`);
        break;
      }
      let proxy = getNextCollisionFreeProxy(offerNumber, availableProxies, offerCount);
      if (!proxy) break;

      if (proxy.resetUrl) {
        await rotateProxyIfNeeded(proxy);
      }

      if (autoRefill.stopRequested || !autoRefill.enabled) break;

      const proxyKey = createProxyUsageKey(proxy, 1, targetUrl);
      const installedChrome = availableChromeBuilds[workerIndex];
      const browserProfileId = 'chrome-' + installedChrome.channel + '-' + installedChrome.major;
      let exitIp;
      let failureReason;
      let activeSession;
      const attemptStartedAt = new Date().toISOString();
      const tileIndex = availableTileIndexes[workerIndex] ?? workerIndex;

      try {
        usageHistory.proxies[proxyKey] = {
          status: 'attempting',
          exitIp: null,
          proxy: proxy.server,
          username: proxy.username ?? '',
          websiteUrl: targetUrl,
          offerNumber: offerNumber,
          streamRole: streamRole,
          attemptedAt: attemptStartedAt,
        };
        await persistProxyUsageHistory(usageHistory);

        const recordExitIp = async (observedIp) => {
          exitIp = observedIp;
          usageHistory.proxies[proxyKey] = {
            status: 'attempting',
            exitIp: exitIp,
            proxy: proxy.server,
            username: proxy.username ?? '',
            websiteUrl: targetUrl,
            offerNumber: offerNumber,
            streamRole: streamRole,
            attemptedAt: attemptStartedAt,
          };
          await persistProxyUsageHistory(usageHistory);
        };
        const leadConfig = {
          enabled: body.enableLeadCheck !== false,
          apiUrl: body.leadCheckApiUrl || DEFAULT_LEAD_CONFIG.apiUrl,
          cookie: body.leadCheckCookie || DEFAULT_LEAD_CONFIG.cookie,
          datas: body.leadCheckDatas || DEFAULT_LEAD_CONFIG.datas,
          intervalSeconds: Number(body.leadCheckInterval) || DEFAULT_LEAD_CONFIG.intervalSeconds,
          maxAttempts: Number(body.leadCheckMaxAttempts) || DEFAULT_LEAD_CONFIG.maxAttempts,
          checkScreen: Number(body.leadCheckScreen) || DEFAULT_LEAD_CONFIG.checkScreen || 4,
        };
        const chosenDeviceProfile = getNextDeviceProfile();
        if (delayStart > 0) {
          await new Promise((r) => setTimeout(r, delayStart * 1000));
        }

        if (autoRefill.stopRequested || !autoRefill.enabled) break;

        const openedBrowser = await openBrowserWithInstalledChrome({
          build: installedChrome,
          proxy: proxy,
          proxyKey: proxyKey,
          websiteUrl: targetUrl,
          offerNumber: offerNumber,
          usedExitIps: usedExitIps,
          onExitIp: recordExitIp,
          tile: tileAt(tileIndex, layoutCount, screen),
          tileIndex: tileIndex,
          autofillRecords: autofillRecords,
          autoSubmit: body.autoSubmitForm !== false,
          leadConfig,
          deviceProfile: chosenDeviceProfile,
          streamRole: streamRole,
          streamLabel: streamLabel,
          scriptSteps, captchaApiKey, completeText, timeLimit, delayStop, scriptPath,
          antiFingerprint,
          checkDuplicate: body.checkDuplicate !== false,
          hideUntilTarget,
          hideUntilLead,
        });
        activeSession = openedBrowser.session;
        successfulBrowsers += 1;
        chromeBuildRotationCounter += 1;

        // Quản lý hàng đợi proxyQueue:
        // 1 proxy dùng lại được cho tất cả offer; chỉ chuyển proxy vào proxyQueue.used
        // khi TẤT CẢ các offer đang cấu hình đều đã hoàn tất sử dụng proxy này thành công.
        if (isProxyUsedByAllOffers(proxy, offerCount)) {
          const queueIdx = proxyQueue.available.indexOf(proxy._queueLine);
          if (queueIdx !== -1) {
            proxyQueue.available.splice(queueIdx, 1);
            proxyQueue.used.push(proxy._queueLine);
            void saveProxyQueue();
          }
        }

        usageHistory.proxies[proxyKey] = {
          status: 'success',
          exitIp: exitIp,
          proxy: proxy.server,
          username: proxy.username ?? '',
          websiteUrl: targetUrl,
          offerNumber: offerNumber,
          streamRole: streamRole,
          finalUrl: openedBrowser.finalUrl,
          profileId: browserProfileId,
          attemptedAt: attemptStartedAt,
          completedAt: new Date().toISOString(),
        };
        await persistProxyUsageHistory(usageHistory);
        watchTrafficBlockedPage(activeSession);
        results.push('Trình duyệt ' + successfulBrowsers + ' [Google Chrome '
          + installedChrome.version + (streamLabel ? ` - ${streamLabel}` : '') + ']: mở đúng trang đích '
          + targetUrl + ' qua IP ' + exitIp + ' (' + proxy.server + ').');
        return;
      } catch (error) {
        releaseProxyLock(proxy, exitIp);
        const pKey = proxy?.server || proxy?._queueLine;
        if (pKey) {
          multiOfferState.offerUsed.get(offerNumber)?.delete(pKey);
        }
        failureReason = error.message.split('\n')[0];
        if (activeSession) {
          activeSession.suppressAutoRefill = true;
          activeSession.isClosed = true;
          await activeSession.browser?.close?.().catch(() => {});
          if (activeSession.proxyKey) {
            await executeFile('pkill', ['-9', '-f', `user-data-dir.*${activeSession.proxyKey}`]).catch(() => {});
          }
        }
        await executeFile('pkill', ['-9', '-f', `user-data-dir.*${proxyKey}`]).catch(() => {});

        if (autoRefill.stopRequested || !autoRefill.enabled) {
          console.log(`[attemptProxy] Stop đã được kích hoạt sau lỗi proxy, dừng worker ${workerIndex + 1}.`);
          break;
        }

        const verificationFailure = error instanceof IpVerificationError;
        usageHistory.proxies[proxyKey] = {
          status: verificationFailure ? 'verification_error' : 'failed',
          exitIp: exitIp ?? null,
          proxy: proxy.server,
          username: proxy.username ?? '',
          websiteUrl: targetUrl,
          streamRole: streamRole,
          reason: failureReason,
          attemptedAt: attemptStartedAt,
          completedAt: new Date().toISOString(),
        };
        await persistProxyUsageHistory(usageHistory);
        if (verificationFailure) {
          results.push('Proxy ' + proxy.server + ': lỗi kết nối khi xác minh IP ('
            + failureReason + '); đóng trình duyệt và thử proxy khác.');
          continue;
        }
        results.push('Proxy ' + proxy.server + ': loại bỏ IP ' + (exitIp ?? 'chưa xác định')
          + ' — ' + failureReason + '; đóng trình duyệt và thử proxy khác.');
      }
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(maxConcurrentProfiles, targetSuccessCount) },
    (_, workerIndex) => attemptProxy(workerIndex),
  ));

  if (successfulBrowsers < targetSuccessCount) {
    warnings.push('Chỉ mở được ' + successfulBrowsers + '/' + targetSuccessCount
      + ' trình duyệt; các proxy còn lại đã hết hoặc không tải đúng trang đích.');
  }
  return { results: results, warnings: warnings };
}

/**
 * Xác nhận daemon GoLogin đang chạy trước khi tạo profile trên tài khoản.
 *
 * @return {Promise<void>} Hoàn tất khi cổng daemon có phản hồi HTTP.
 * @throws {Error} Khi GoLogin desktop chưa chạy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function requireGoLoginDesktop() {
  try {
    await fetch('http://127.0.0.1:36912/', { signal: AbortSignal.timeout(2000) });
  } catch {
    throw new Error('Hãy mở GoLogin desktop và đăng nhập trước khi tạo profile.');
  }
}

/**
 * Dừng một profile do app mở để GoLogin đồng bộ trạng thái trước khi xử lý tiếp.
 *
 * @param {string} profileId ID profile cần dừng.
 * @return {Promise<void>} Hoàn tất sau khi daemon phản hồi.
 * @throws {Error} Khi daemon không thể dừng profile.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function stopGoLoginProfile(profileId) {
  const response = await fetch('http://127.0.0.1:36912/browser/stop-profile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profileId }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`GoLogin desktop không dừng được profile ${profileId} (HTTP ${response.status}).`);
}

/**
 * Yêu cầu GoLogin dừng profile của phiên đúng một lần và chờ kết quả khi cần.
 *
 * @param {object} session Phiên GoLogin do app tạo.
 * @return {Promise<void>} Kết quả dừng profile đã được ghi log nếu thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
function requestGoLoginProfileStop(session) {
  if (!session._profileStopPromise) {
    session._profileStopPromise = stopGoLoginProfile(session.profileId)
      .catch((error) => console.warn(`[GoLogin] Không đồng bộ được profile ${session.profileId}: ${error.message}`));
  }
  return session._profileStopPromise;
}

async function getOrbitaVersion() {
  const browserDir = join(homedir(), '.gologin', 'browser');
  try {
    const entries = await import('node:fs/promises').then(m => m.readdir(browserDir));
    const orbita = entries.find(e => e.startsWith('orbita-browser-') && !e.endsWith('.tar.gz'));
    if (!orbita) return null;
    const plist = join(browserDir, orbita, 'Orbita-Browser.app', 'Contents', 'Info.plist');
    const { stdout } = await executeFile('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist]).catch(() => ({ stdout: '' }));
    return stdout.trim() || null;
  } catch { return null; }
}

async function findOrbitaExecutable() {
  const browserDir = join(homedir(), '.gologin', 'browser');
  try {
    const entries = await readdir(browserDir);
    const orbita = entries.find(e => e.startsWith('orbita-browser-') && !e.endsWith('.tar.gz'));
    if (!orbita) return null;
    const bin = join(browserDir, orbita, 'Orbita-Browser.app', 'Contents', 'MacOS', 'Orbita');
    return existsSync(bin) ? bin : null;
  } catch { return null; }
}

/**
 * Loại khỏi danh sách phiên GoLogin những kết nối CDP đã đóng.
 *
 * @return {Promise<void>} Hoàn tất sau khi dọn trạng thái phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function pruneDeadGoLoginSessions() {
  for (const s of [...activeBrowsers]) {
    if (s.isGoLogin && s.profileId && !s._cdpBrowser?.isConnected()) {
      if (s._monitorInterval) {
        clearInterval(s._monitorInterval);
        s._monitorInterval = null;
      }
      s.isClosed = true;
      releaseProxyLock(s.proxy, s.exitIp);
      if (!s.proxy) activeExitIpLocks.delete('Direct');
      activeBrowsers.delete(s);
      if (s.isLocalEngine) {
        void s._relay?.close().catch(() => {});
        void stopLocalProfileBrowser(s._proc, s.profilePath);
      } else {
        void requestGoLoginProfileStop(s);
      }
      console.log(`[GoLogin] Đã tự dọn session đóng cho profile ${s.profileId} (Slot ${s.slot}).`);
    }
  }
}

/**
 * Kiểm tra IP exit của proxy trước khi cấp profile GoLogin.
 *
 * @param {object} proxyObj Proxy HTTP hoặc SOCKS5 đã phân tích.
 * @return {Promise<string|null>} IP exit hoặc null nếu proxy không hoạt động.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function checkProxyExitIp(proxyObj) {
  if (!proxyObj || !proxyObj.server) return null;
  try {
    const info = await requestProxyIpInfo(proxyObj);
    return typeof info.ip === 'string' && /^\d{1,3}(\.\d{1,3}){3}$/.test(info.ip) ? info.ip : null;
  } catch {}
  return null;
}

/**
 * Mở Chrome bằng profile cục bộ từ zero_profile theo vòng đời của bản PC gốc.
 * Áp dụng các tùy chọn fingerprint mà app Mac hỗ trợ qua CDP.
 *
 * @param {object} options Tham số luồng, proxy, slot, autofill, antiFingerprint và script.
 * @return {Promise<object>} Session trình duyệt đã kết nối.
 * @throws {Error} Khi không tìm thấy trình duyệt hoặc không thể kết nối CDP.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function openBrowserViaLocalEngine({
  tileIndex, slot, proxy, verifiedExitIp, websiteUrl, offer = 1,
  autofillRecords = [], autoSubmit = true, leadConfig = {}, scriptSteps = null,
  captchaApiKey = '', completeText = '', timeLimit = 0, delayStop = 0, scriptPath = '',
  hideUntilTarget = false, hideUntilLead = false, antiFingerprint = {}, deviceProfile = 'windows',
  totalCount = 10,
}) {
  const assignedSlot = slot ?? (tileIndex + 1);
  const screen = await readScreenSize();
  const tile = tileAt(tileIndex ?? (assignedSlot - 1), totalCount || 10, screen);

  let timezoneId;
  let ipCountry;
  let ipLat = 0, ipLng = 0;
  if (proxy) {
    try {
      const ipInfo = await requestProxyIpInfo(proxy).catch(() => requestProxyIpInfo(proxy));
      if (typeof ipInfo.timezone === 'string' && ipInfo.timezone.includes('/')) timezoneId = ipInfo.timezone;
      if (typeof ipInfo.country === 'string') ipCountry = ipInfo.country;
      if (typeof ipInfo.loc === 'string') {
        const parts = ipInfo.loc.split(',').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) [ipLat, ipLng] = parts;
      }
    } catch {}
  }

  const { locale, languages } = localeForCountry(ipCountry);
  const relay = proxy?.username
    ? await (proxy.server.startsWith('socks5://') ? startAuthenticatedSocksRelay(proxy) : startAuthenticatedHttpRelay(proxy))
    : null;
  const proxyUrl = relay?.proxy?.server ?? proxy?.server ?? null;

  let profilePath;
  try {
    profilePath = await prepareLocalZeroProfile({
      slot: assignedSlot,
      locale,
      languages,
      bookmarks,
    });
  } catch (error) {
    await relay?.close();
    throw error;
  }

  // Chọn build Chrome tốt nhất từ danh sách đã cài hoặc mặc định
  let executablePath = null;
  let chromeVersion = '150.0.7871.187';
  try {
    const builds = await listInstalledChromeChannels();
    if (builds.length > 0) {
      const chosen = builds[tileIndex % builds.length] || builds[0];
      executablePath = chosen.executablePath;
      chromeVersion = chosen.version;
    }
  } catch {}
  if (!executablePath) executablePath = resolveBrowserExecutable();

  let proc, wsUrl;
  try {
    ({ proc, wsUrl } = await spawnLocalProfileBrowser({
      profilePath,
      proxyUrl,
      tile,
      locale,
      executablePath,
    }));
  } catch (err) {
    await relay?.close();
    await cleanupLocalProfile(profilePath);
    throw err;
  }

  let cdpBrowser;
  try {
    cdpBrowser = await Promise.race([
      chromium.connectOverCDP(wsUrl),
      new Promise((_, reject) => setTimeout(() => reject(new Error('CDP connect timeout 15s')), 15000)),
    ]);
  } catch (err) {
    await relay?.close();
    await stopLocalProfileBrowser(proc, profilePath);
    throw err;
  }

  const context = cdpBrowser.contexts()[0];
  if (!context) {
    await cdpBrowser.close().catch(() => {});
    await relay?.close();
    await stopLocalProfileBrowser(proc, profilePath);
    throw new Error('Chromium không tạo context mặc định để kết nối.');
  }

  // Giả lập thiết bị + chống fingerprint native
  const sessionSeed = Math.floor(Math.random() * 0x7fffffff) || 1;
  const profileKey = DEVICE_PROFILES[deviceProfile] ? deviceProfile : 'windows';
  const dp = createDeviceVariant(profileKey, DEVICE_PROFILES[profileKey], sessionSeed, { width: tile.width, height: tile.height });
  const stealthConfig = buildStealthConfig(dp, antiFingerprint, sessionSeed);
  let initPage;
  let detectedIp = null;
  try {
  await context.addInitScript(stealthInitScript, stealthConfig);
  const nativeOverrides = {
    userAgentOverride: buildUserAgentOverride(dp, { version: chromeVersion }, languages),
    hardwareConcurrency: dp.spoof.hardwareConcurrency,
  };

  initPage = context.pages()[0] || await context.newPage();
  await applyNativeOverrides(context, initPage, nativeOverrides);
  context.on('page', (p) => void applyNativeOverrides(context, p, nativeOverrides));

  if (proxy) {
    try {
      for (const checkUrl of browserIpCheckUrls) {
        try {
          const resp = await initPage.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
          if (!resp?.ok()) continue;
          const content = await initPage.locator('body').innerText();
          const match = content.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
          if (match) {
            detectedIp = match[0];
            break;
          }
        } catch {}
      }
    } catch {}
  }
  if (proxy && !detectedIp) {
    throw new Error('Không xác minh được IP proxy trong trình duyệt.');
  }
  if (proxy && verifiedExitIp && detectedIp !== verifiedExitIp) {
    throw new Error(`IP proxy trong trình duyệt (${detectedIp}) khác IP đã kiểm tra (${verifiedExitIp}).`);
  }
  if (!proxy) detectedIp = 'Direct';
  } catch (error) {
    await cdpBrowser.close().catch(() => {});
    await relay?.close();
    await stopLocalProfileBrowser(proc, profilePath);
    throw error;
  }

  const session = {
    browser: context,
    _cdpBrowser: cdpBrowser,
    _proc: proc,
    _relay: relay,
    profilePath,
    tileIndex: tileIndex ?? (assignedSlot - 1),
    slot: assignedSlot,
    chromeVersion: `PC Zero-Profile (${chromeVersion})`,
    deviceProfile: profileKey,
    suppressAutoRefill: false,
    proxy: proxy ?? null,
    proxyKey: proxy?.server ?? `local_slot_${assignedSlot}`,
    proxyServer: proxy?.server ?? `local_slot_${assignedSlot}`,
    exitIp: detectedIp,
    offer,
    offerNumber: offer,
    streamRole: offer,
    streamLabel: `Offer ${offer}`,
    websiteUrl: websiteUrl || '',
    profileId: `local_${assignedSlot}`,
    isGoLogin: true,
    isLocalEngine: true,
    hideUntilTarget: Boolean(hideUntilTarget),
    hideUntilLead: Boolean(hideUntilLead),
    hasShownWindow: false,
    leadCheckStatus: null,
    leadCheckMessage: null,
    updateBadge: (text) => { session.badgeText = text; },
  };
  activeBrowsers.add(session);

  let cdpSession = null;
  let cdpWindowId = null;

  if (hideUntilTarget || hideUntilLead) {
    try {
      cdpSession = await context.newCDPSession(initPage);
      const win = await cdpSession.send('Browser.getWindowForTarget');
      cdpWindowId = win.windowId;
      await cdpSession.send('Browser.setWindowBounds', {
        windowId: cdpWindowId,
        bounds: { windowState: 'minimized' },
      });
      const modeText = hideUntilLead ? 'chỉ hiện khi có lead' : 'chỉ hiện khi vào trang đích';
      console.log(`[LocalEngine] Slot ${assignedSlot}: Chạy ngầm (ẩn cửa sổ), ${modeText}.`);
      session.addBrowserLog?.({ type: 'navigate', detail: `Chạy ngầm (ẩn cửa sổ), ${modeText}...` });
    } catch (err) {
      console.warn('[LocalEngine] Lỗi ẩn cửa sổ ban đầu:', err.message);
    }
  }

  session.showWindow = async (force = false) => {
    if ((!hideUntilTarget && !hideUntilLead) || session.hasShownWindow) return;
    if (hideUntilLead && !force) return;
    session.hasShownWindow = true;
    try {
      const activePage = session.mainPage || (context.pages().filter(p => !p.isClosed())[0]);
      if (!cdpSession && activePage) {
        cdpSession = await context.newCDPSession(activePage);
      }
      if (cdpSession) {
        if (!cdpWindowId) {
          const win = await cdpSession.send('Browser.getWindowForTarget');
          cdpWindowId = win.windowId;
        }
        await cdpSession.send('Browser.setWindowBounds', {
          windowId: cdpWindowId,
          bounds: {
            left: tile.left,
            top: tile.top,
            width: tile.width,
            height: tile.height,
            windowState: 'normal',
          },
        });
        if (activePage) await activePage.bringToFront().catch(() => {});
        const reasonText = hideUntilLead ? 'Đã có lead thành công' : 'Đã vào trang đích an toàn';
        console.log(`[LocalEngine] Slot ${assignedSlot}: ${reasonText}, hiển thị trình duyệt.`);
        session.addBrowserLog?.({ type: 'navigate', detail: `${reasonText}, hiển thị cửa sổ trình duyệt.` });
      }
    } catch (err) {
      console.warn('[LocalEngine] Lỗi hiển thị cửa sổ:', err.message);
    }
  };

  const assignedEmail = dequeueNextEmail();
  if (assignedEmail) session.assignedEmail = assignedEmail;

  attachBrowserLogger(context, session);

  context.on('close', () => {
    session.isClosed = true;
    if (session.leadCheckStatus === 'confirmed' && session.exitIp) {
      saveAndRecordLeadIpStats({
        ip: session.exitIp,
        screen: Math.max(session.screenReached || 1, session.currentScreen || 1, (session.completedScreens || 0) + 1),
        completedScreens: session.completedScreens || 0,
        jumpCount: Math.max(session.pageJumps || 0, session.completedScreens || 0),
        offerNumber: session.offerNumber ?? session.streamRole ?? 1,
        proxy: session.proxyServer || session.proxyKey,
        websiteUrl: session.websiteUrl,
      });
    }
    activeBrowsers.delete(session);
    releaseProxyLock(proxy ?? null, session.exitIp);
    if (!proxy) activeExitIpLocks.delete('Direct');
    cdpBrowser.close().catch(() => {});
    void relay?.close().catch(() => {});
    session._localStopPromise = stopLocalProfileBrowser(proc, profilePath);

    const sc = screencastSessions.get(assignedSlot);
    if (sc) {
      if (sc.keepaliveTimer) { clearInterval(sc.keepaliveTimer); sc.keepaliveTimer = null; }
      sc.cdpClient.detach().catch(() => {});
      try { sc.sseResponse.end(); } catch {}
      screencastSessions.delete(assignedSlot);
    }
    console.log(`[LocalEngine] Profile Slot ${assignedSlot} đã đóng.`);

    if (!session.suppressAutoRefill && autoRefill.enabled && !autoRefill.stopRequested) {
      const baseDelay = (autoRefill.sequential || session.closingDueToNoLead) ? 5000 : 0;
      queueAutomaticRefill(baseDelay + delayStop * 1000);
    }
  });

  session.mainPage = initPage;

  if (websiteUrl) {
    await Promise.race([
      initPage.goto(websiteUrl, { timeout: navigationTimeout, waitUntil: 'domcontentloaded' }).catch(() => {}),
      new Promise(r => setTimeout(r, navigationTimeout + 2000)),
    ]);
    if (!hideUntilLead) {
      await session.showWindow();
    }
    await initPage.bringToFront().catch(() => {});
  }

  closeChromeWhenLastTabCloses(session);
  watchTrafficBlockedPage(session);

  if (completeText) {
    const needle = completeText.toLowerCase();
    const completeTimer = setInterval(async () => {
      if (initPage.isClosed()) { clearInterval(completeTimer); return; }
      const found = await initPage.evaluate((n) => (document.body?.innerText || '').toLowerCase().includes(n), needle).catch(() => false);
      if (found) {
        clearInterval(completeTimer);
        limitRunCount += 1;
        session.addLog?.({ time: new Date().toISOString(), type: 'complete_text', detail: `Text hoàn tất "${completeText}" (${limitRunCount}${limitRunMax > 0 ? '/' + limitRunMax : ''}).` });
        if (limitRunMax > 0 && limitRunCount >= limitRunMax) void tgNotify(`🎉 <b>Hoàn thành!</b> Đạt ${limitRunCount}/${limitRunMax} leads. Luồng đã dừng.`);
        session.suppressAutoRefill = false;
        await session.browser?.close?.().catch(() => {});
      }
    }, 2000);
    context.on('close', () => clearInterval(completeTimer));
  }

  if (timeLimit > 0) {
    const timeLimitTimer = setTimeout(async () => {
      session.addLog?.({ time: new Date().toISOString(), type: 'time_limit', detail: `Hết timeout phiên (${timeLimit}s), đóng trình duyệt.` });
      await session.browser?.close?.().catch(() => {});
    }, timeLimit * 1000);
    context.on('close', () => clearTimeout(timeLimitTimer));
  }

  if (scriptSteps?.length > 0) {
    void (async () => {
      await initPage.waitForLoadState('domcontentloaded', { timeout: navigationTimeout }).catch(() => {});
      const record = session.currentRecord ?? autofillRecords[0] ?? {};
      await runScript(initPage, scriptSteps, record, {
        captchaApiKey,
        scriptDir: scriptPath ? dirname(scriptPath) : '',
        logger: (entry) => session.addLog?.({ time: new Date().toISOString(), ...entry }),
      });
    })();
  }

  const recordPool = autofillQueue.available.length > 0 ? autofillQueue.available : autofillRecords;
  if (websiteUrl) {
    attachAutofill(context, recordPool, new URL(websiteUrl).origin, session, {
      autoSubmit,
      enableLeadCheck: leadConfig.enabled !== false,
      leadCheckScreen: leadConfig.checkScreen || 4,
      onLog: (entry) => {
        if (entry && (entry.type === 'field_filled' || entry.type === 'submit_clicked' || entry.type === 'lead_confirmed' || entry.type === 'ai_action')) {
          if (!session.hideUntilLead || entry.type === 'lead_confirmed') {
            void session.showWindow?.(entry.type === 'lead_confirmed');
          }
        }
        session.addBrowserLog?.(entry);
      },
      onRecordPicked: (record) => {
        if (!session.hideUntilLead) {
          void session.showWindow?.();
        }
        if (session.assignedEmail && record) {
          record.email = session.assignedEmail;
          record.emailaddress = session.assignedEmail;
          record.mail = session.assignedEmail;
          record.assignedEmail = session.assignedEmail;
        }
        session.currentRecord = record;
        const idx = autofillQueue.available.findIndex((r) => r === record || autofillRecordKey(r) === autofillRecordKey(record));
        if (idx !== -1) {
          autofillQueue.available.splice(idx, 1);
          autofillQueue.used.push(record);
          void saveAutofillQueue();
        }
        void markAutofillRecordUsed(record);
      },
      onScreen5Reached: (sess, p) => { void startLeadVerification(sess, leadConfig); },
      onEmailSubmitted: (sess, p) => { void startLeadVerification(sess, leadConfig); },
      onScreenAdvanced: (sess, screen, jumps) => {
        if (sess.leadCheckStatus === 'confirmed' && sess.exitIp) {
          saveAndRecordLeadIpStats({
            ip: sess.exitIp,
            screen,
            completedScreens: sess.completedScreens,
            jumpCount: jumps,
            offerNumber: sess.offerNumber ?? sess.streamRole ?? 1,
            proxy: sess.proxyServer || sess.proxyKey,
            websiteUrl: sess.websiteUrl,
          });
        }
      },
      onPageJump: (sess, jumps, url) => {
        if (sess.leadCheckStatus === 'confirmed' && sess.exitIp) {
          saveAndRecordLeadIpStats({
            ip: sess.exitIp,
            screen: Math.max(sess.screenReached || 1, sess.currentScreen || 1, (sess.completedScreens || 0) + 1),
            completedScreens: sess.completedScreens || 0,
            jumpCount: jumps,
            offerNumber: sess.offerNumber ?? sess.streamRole ?? 1,
            proxy: sess.proxyServer || sess.proxyKey,
            websiteUrl: sess.websiteUrl,
          });
        }
      },
      onStuck: (p) => {
        if (session.mainPage && p !== session.mainPage) return;
        if (session.aiAssistRunning) return;
        const currentUrl = p.url?.() || '';
        if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.includes('api.ipify.org')) return;
        const now = Date.now();
        if (session.lastAiUrl === currentUrl && (now - (session.lastAiTime || 0) < 4000)) return;
        session.lastAiUrl = currentUrl;
        session.lastAiTime = now;
        const currentRecord = session.currentRecord ?? autofillRecords[0] ?? {};
        if (session.assignedEmail && currentRecord) {
          currentRecord.email = session.assignedEmail;
          currentRecord.emailaddress = session.assignedEmail;
          currentRecord.mail = session.assignedEmail;
          currentRecord.assignedEmail = session.assignedEmail;
        }
        void runAiAssist(p, currentRecord, session, { onLog: (e) => session.addLog?.(e) });
      },
    });
  }

  return session;
}

/**
 * Mở profile GoLogin đã tạo bằng API, xác minh proxy trong Orbita rồi gắn Playwright.
 *
 * @param {object} options ID profile, proxy, slot và dữ liệu tự động hóa của phiên.
 * @return {Promise<object>} Session trình duyệt đã kết nối.
 * @throws {Error} Khi Orbita, daemon, CDP hoặc IP proxy không khớp.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function openBrowserViaGoLogin({ tileIndex, slot, profileId, proxy, verifiedExitIp, websiteUrl, offer = 1,
  autofillRecords = [], autoSubmit = true, leadConfig = {}, scriptSteps = null,
  captchaApiKey = '', completeText = '', timeLimit = 0, delayStop = 0, scriptPath = '',
  hideUntilTarget = false, hideUntilLead = false, totalCount = 10 }) {

  const orbitaBin = await findOrbitaExecutable();
  if (!orbitaBin) throw new Error('Không tìm thấy Orbita browser. Hãy mở GoLogin app để tải về (hoặc đăng nhập GoLogin).');

  const assignedSlot = slot ?? (tileIndex + 1);
  const screen = await readScreenSize();
  const tile = tileAt(tileIndex ?? (assignedSlot - 1), totalCount || 10, screen);
  const orbitaVersion = await getOrbitaVersion();

  const proxyUrl = proxy?.server ?? null;
  const initialExitIp = verifiedExitIp || 'Direct';

  // Desktop cấp run token hợp lệ, khởi động Orbita và trả về CDP URL.
  let goLoginResp = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    goLoginResp = await fetch('http://127.0.0.1:36912/browser/start-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, sync: true }),
      signal: AbortSignal.timeout(45000),
    }).then((response) => response.ok ? response.json() : null).catch(() => null);
    if (goLoginResp?.wsUrl) break;
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  if (!goLoginResp?.wsUrl) {
    throw new Error('GoLogin desktop chưa mở được profile vừa tạo hoặc không trả CDP URL.');
  }

  // Kết nối Playwright vào Orbita đang chạy qua CDP (timeout 15s).
  const cdpBrowser = await Promise.race([
    chromium.connectOverCDP(goLoginResp.wsUrl),
    new Promise((_, reject) => setTimeout(() => reject(new Error('CDP connect timeout 15s')), 15000)),
  ]);
  console.log(`[GoLogin] CDP connected. Contexts: ${cdpBrowser.contexts().length}`);
  const context = cdpBrowser.contexts()[0];
  if (!context) {
    await cdpBrowser.close().catch(() => {});
    await stopGoLoginProfile(profileId).catch(() => {});
    throw new Error('Orbita không có profile mặc định để kết nối.');
  }

  // Kiểm tra IP ngay trong Orbita: proxy cấu hình trên cloud phải thật sự áp dụng.
  let detectedIp = null;
  let ipCheckPage = null;
  try {
    ipCheckPage = await context.newPage();
    for (const checkUrl of browserIpCheckUrls) {
      try {
        const response = await ipCheckPage.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: 8000 });
        if (!response?.ok()) continue;
        const content = await ipCheckPage.locator('body').innerText();
        const match = content.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
        if (match) {
          detectedIp = match[0];
          break;
        }
      } catch {
        // Dịch vụ IP đầu tiên lỗi thì thử dịch vụ còn lại.
      }
    }
    if (!detectedIp) throw new Error('Không xác minh được IP trong Orbita.');
    if (proxy && detectedIp !== verifiedExitIp) {
      throw new Error(`Proxy trong Orbita ra IP ${detectedIp}, khác IP đã kiểm tra ${verifiedExitIp}.`);
    }
  } catch (error) {
    await cdpBrowser.close().catch(() => {});
    await stopGoLoginProfile(profileId).catch(() => {});
    throw error;
  } finally {
    await ipCheckPage?.close().catch(() => {});
  }

  const session = {
    browser: context,
    _cdpBrowser: cdpBrowser,
    tileIndex: tileIndex ?? (assignedSlot - 1),
    slot: assignedSlot,
    chromeVersion: orbitaVersion ?? 'GoLogin',
    deviceProfile: 'macos',
    suppressAutoRefill: false,
    proxy: proxy ?? null,
    proxyKey: proxyUrl ?? profileId,
    proxyServer: proxyUrl ?? profileId,
    exitIp: detectedIp || initialExitIp,
    offer,
    offerNumber: offer,
    streamRole: offer,
    streamLabel: `Offer ${offer}`,
    websiteUrl: websiteUrl || '',
    profileId,
    isGoLogin: true,
    hideUntilTarget: Boolean(hideUntilTarget),
    hideUntilLead: Boolean(hideUntilLead),
    hasShownWindow: false,
    leadCheckStatus: null,
    leadCheckMessage: null,
    updateBadge: (text) => { session.badgeText = text; },
  };
  activeBrowsers.add(session);

  let cdpSession = null;
  let cdpWindowId = null;

  if (hideUntilTarget || hideUntilLead) {
    try {
      const initPage = context.pages()[0] ?? await context.newPage();
      cdpSession = await context.newCDPSession(initPage);
      const win = await cdpSession.send('Browser.getWindowForTarget');
      cdpWindowId = win.windowId;
      await cdpSession.send('Browser.setWindowBounds', {
        windowId: cdpWindowId,
        bounds: { windowState: 'minimized' },
      });
      const modeText = hideUntilLead ? 'chỉ hiện khi có lead' : 'chỉ hiện khi vào trang đích';
      console.log(`[GoLogin] Slot ${assignedSlot}: Chạy ngầm (ẩn cửa sổ), ${modeText}.`);
      session.addBrowserLog?.({ type: 'navigate', detail: `Chạy ngầm (ẩn cửa sổ), ${modeText}...` });
    } catch (err) {
      console.warn('[GoLogin] Lỗi ẩn cửa sổ ban đầu:', err.message);
    }
  }

  session.showWindow = async (force = false) => {
    if ((!hideUntilTarget && !hideUntilLead) || session.hasShownWindow) return;
    if (hideUntilLead && !force) return;
    session.hasShownWindow = true;
    try {
      const activePage = session.mainPage || (context.pages().filter(p => !p.isClosed())[0]);
      if (!cdpSession && activePage) {
        cdpSession = await context.newCDPSession(activePage);
      }
      if (cdpSession) {
        if (!cdpWindowId) {
          const win = await cdpSession.send('Browser.getWindowForTarget');
          cdpWindowId = win.windowId;
        }
        await cdpSession.send('Browser.setWindowBounds', {
          windowId: cdpWindowId,
          bounds: {
            left: tile.left,
            top: tile.top,
            width: tile.width,
            height: tile.height,
            windowState: 'normal',
          },
        });
        if (activePage) await activePage.bringToFront().catch(() => {});
        const reasonText = hideUntilLead ? 'Đã có lead thành công' : 'Đã vào trang đích an toàn';
        console.log(`[GoLogin] Slot ${assignedSlot}: ${reasonText}, hiển thị trình duyệt.`);
        session.addBrowserLog?.({ type: 'navigate', detail: `${reasonText}, hiển thị cửa sổ trình duyệt.` });
      }
    } catch (err) {
      console.warn('[GoLogin] Lỗi hiển thị cửa sổ:', err.message);
    }
  };

  const assignedEmail = dequeueNextEmail();
  if (assignedEmail) session.assignedEmail = assignedEmail;

  attachBrowserLogger(context, session);

  context.on('close', () => {
    session.isClosed = true;
    if (session.leadCheckStatus === 'confirmed' && session.exitIp) {
      saveAndRecordLeadIpStats({
        ip: session.exitIp,
        screen: Math.max(session.screenReached || 1, session.currentScreen || 1, (session.completedScreens || 0) + 1),
        completedScreens: session.completedScreens || 0,
        jumpCount: Math.max(session.pageJumps || 0, session.completedScreens || 0),
        offerNumber: session.offerNumber ?? session.streamRole ?? 1,
        proxy: session.proxyServer || session.proxyKey,
        websiteUrl: session.websiteUrl,
      });
    }
    activeBrowsers.delete(session);
    releaseProxyLock(proxy ?? null, session.exitIp);
    if (!proxy) activeExitIpLocks.delete('Direct');
    cdpBrowser.close().catch(() => {});
    void requestGoLoginProfileStop(session);
    const sc = screencastSessions.get(assignedSlot);
    if (sc) {
      if (sc.keepaliveTimer) { clearInterval(sc.keepaliveTimer); sc.keepaliveTimer = null; }
      sc.cdpClient.detach().catch(() => {});
      try { sc.sseResponse.end(); } catch {}
      screencastSessions.delete(assignedSlot);
    }
    console.log(`[GoLogin] Profile ${profileId} (Slot ${assignedSlot}) đã đóng.`);
    if (!session.suppressAutoRefill && autoRefill.enabled && !autoRefill.stopRequested) {
      const baseDelay = (autoRefill.sequential || session.closingDueToNoLead) ? 5000 : 0;
      queueAutomaticRefill(baseDelay + delayStop * 1000);
    }
  });

  // Điều hướng tới URL offer
  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  session.mainPage = page;

  if (websiteUrl) {
    await Promise.race([
      page.goto(websiteUrl, { timeout: navigationTimeout, waitUntil: 'domcontentloaded' }).catch(() => {}),
      new Promise(r => setTimeout(r, navigationTimeout + 2000)),
    ]);
    if (!hideUntilLead) {
      await session.showWindow();
    }
    await page.bringToFront().catch(() => {});

  }

  closeChromeWhenLastTabCloses(session);
  watchTrafficBlockedPage(session);

  if (completeText) {
    const needle = completeText.toLowerCase();
    const completeTimer = setInterval(async () => {
      if (page.isClosed()) { clearInterval(completeTimer); return; }
      const found = await page.evaluate((n) => (document.body?.innerText || '').toLowerCase().includes(n), needle).catch(() => false);
      if (found) {
        clearInterval(completeTimer);
        limitRunCount += 1;
        session.addLog?.({ time: new Date().toISOString(), type: 'complete_text', detail: `Text hoàn tất "${completeText}" (${limitRunCount}${limitRunMax > 0 ? '/' + limitRunMax : ''}).` });
        if (limitRunMax > 0 && limitRunCount >= limitRunMax) void tgNotify(`🎉 <b>Hoàn thành!</b> Đạt ${limitRunCount}/${limitRunMax} leads. Luồng đã dừng.`);
        session.suppressAutoRefill = false;
        await session.browser?.close?.().catch(() => {});
      }
    }, 2000);
    context.on('close', () => clearInterval(completeTimer));
  }

  if (timeLimit > 0) {
    const timeLimitTimer = setTimeout(async () => {
      session.addLog?.({ time: new Date().toISOString(), type: 'time_limit', detail: `Hết timeout phiên (${timeLimit}s), đóng trình duyệt.` });
      await session.browser?.close?.().catch(() => {});
    }, timeLimit * 1000);
    context.on('close', () => clearTimeout(timeLimitTimer));
  }

  if (scriptSteps?.length > 0) {
    void (async () => {
      await page.waitForLoadState('domcontentloaded', { timeout: navigationTimeout }).catch(() => {});
      const record = session.currentRecord ?? autofillRecords[0] ?? {};
      await runScript(page, scriptSteps, record, {
        captchaApiKey,
        scriptDir: scriptPath ? dirname(scriptPath) : '',
        logger: (entry) => session.addLog?.({ time: new Date().toISOString(), ...entry }),
      });
    })();
  }

  // Autofill logic giống hệt Chrome thường
  const recordPool = autofillQueue.available.length > 0 ? autofillQueue.available : autofillRecords;
  if (websiteUrl) {
    attachAutofill(context, recordPool, new URL(websiteUrl).origin, session, {
      autoSubmit,
      enableLeadCheck: leadConfig.enabled !== false,
      leadCheckScreen: leadConfig.checkScreen || 4,
      onLog: (entry) => {
        if (entry && (entry.type === 'field_filled' || entry.type === 'submit_clicked' || entry.type === 'lead_confirmed' || entry.type === 'ai_action')) {
          if (!session.hideUntilLead || entry.type === 'lead_confirmed') {
            void session.showWindow?.(entry.type === 'lead_confirmed');
          }
        }
        session.addBrowserLog?.(entry);
      },
      onRecordPicked: (record) => {
        if (!session.hideUntilLead) {
          void session.showWindow?.();
        }
        if (session.assignedEmail && record) {
          record.email = session.assignedEmail;
          record.emailaddress = session.assignedEmail;
          record.mail = session.assignedEmail;
          record.assignedEmail = session.assignedEmail;
        }
        session.currentRecord = record;
        const idx = autofillQueue.available.findIndex((r) => r === record || autofillRecordKey(r) === autofillRecordKey(record));
        if (idx !== -1) {
          autofillQueue.available.splice(idx, 1);
          autofillQueue.used.push(record);
          void saveAutofillQueue();
        }
        void markAutofillRecordUsed(record);
      },
      onScreen5Reached: (sess, p) => { void startLeadVerification(sess, leadConfig); },
      onEmailSubmitted: (sess, p) => { void startLeadVerification(sess, leadConfig); },
      onScreenAdvanced: (sess, screen, jumps) => {
        if (sess.leadCheckStatus === 'confirmed' && sess.exitIp) {
          saveAndRecordLeadIpStats({
            ip: sess.exitIp,
            screen,
            completedScreens: sess.completedScreens,
            jumpCount: jumps,
            offerNumber: sess.offerNumber ?? sess.streamRole ?? 1,
            proxy: sess.proxyServer || sess.proxyKey,
            websiteUrl: sess.websiteUrl,
          });
        }
      },
      onPageJump: (sess, jumps, url) => {
        if (sess.leadCheckStatus === 'confirmed' && sess.exitIp) {
          saveAndRecordLeadIpStats({
            ip: sess.exitIp,
            screen: Math.max(sess.screenReached || 1, sess.currentScreen || 1, (sess.completedScreens || 0) + 1),
            completedScreens: sess.completedScreens || 0,
            jumpCount: jumps,
            offerNumber: sess.offerNumber ?? sess.streamRole ?? 1,
            proxy: sess.proxyServer || sess.proxyKey,
            websiteUrl: sess.websiteUrl,
          });
        }
      },
      onStuck: (p) => {
        if (session.mainPage && p !== session.mainPage) return;
        if (session.aiAssistRunning) return;
        const currentUrl = p.url?.() || '';
        if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.includes('api.ipify.org')) return;
        const now = Date.now();
        if (session.lastAiUrl === currentUrl && (now - (session.lastAiTime || 0) < 4000)) return;
        session.lastAiUrl = currentUrl;
        session.lastAiTime = now;
        const currentRecord = session.currentRecord ?? autofillRecords[0] ?? {};
        if (session.assignedEmail && currentRecord) {
          currentRecord.email = session.assignedEmail;
          currentRecord.emailaddress = session.assignedEmail;
          currentRecord.mail = session.assignedEmail;
          currentRecord.assignedEmail = session.assignedEmail;
        }
        void runAiAssist(p, currentRecord, session, { onLog: (e) => session.addLog?.(e) });
      },
    });
  }

  return session;
}

/**
 * Tạo profile cục bộ từ zero_profile cho mỗi proxy rồi mở Chrome theo từng slot.
 *
 * @param {string} requestBody JSON từ giao diện Mac 2.
 * @return {Promise<{results: object[], warnings: string[]}>} Kết quả mở các slot.
 * @throws {Error} Khi thiếu token hoặc GoLogin desktop chưa chạy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function launchGoLoginBrowsers(requestBody) {
  autoRefill.stopRequested = false;
  autoRefill.enabled = true;
  const body = JSON.parse(requestBody);
  const concurrency = Math.min(10, parseInt(body.requestedCount ?? body.concurrency) || 1);
  const websiteUrl = body.websiteUrl || '';
  const offerUrls = body.offerUrls || (body.websiteUrl3 || body.websiteUrl4 || body.websiteUrl2 ? [body.websiteUrl, body.websiteUrl2, body.websiteUrl3, body.websiteUrl4].filter(Boolean) : [websiteUrl].filter(Boolean));

  // Lưu cấu hình autoRefill cho GoLogin mode để khi slot trống tự động bù đúng chế độ
  autoRefill.settings = { ...body, browserMode: 'Gologin' };
  autoRefill.targetCount = concurrency;
  void saveAutoRefillSettings();

  // Parse autofill/script params giống launchRequestedBrowsers
  const scriptPath    = body.scriptPath    ?? '';
  const captchaApiKey = body.captchaApiKey ?? '';
  const completeText  = body.completeText  ?? '';
  const timeLimit     = Math.max(0, Number(body.timeLimit)  || 0);
  const delayStart    = Math.max(0, Number(body.delayStart) || 0);
  const delayStop     = Math.max(0, Number(body.delayStop)  || 0);
  const antiFingerprint = {
    canvas: Boolean(body.antiFpCanvas),
    clientRects: Boolean(body.antiFpClientRects),
    webgl: Boolean(body.antiFpWebgl),
    webrtc: Boolean(body.antiFpWebrtc),
  };
  let scriptSteps = null;
  if (scriptPath) { try { scriptSteps = await loadScript(scriptPath); } catch {} }
  const autofillRecords = parseAutofillRecords(body.autofillData);
  if (autofillRecords.length > 0) {
    const added = importAutofillRecords(autofillRecords);
    if (added > 0) await saveAutofillQueue();
  }
  const leadConfig = {
    enabled: body.enableLeadCheck !== false,
    apiUrl: body.leadCheckApiUrl || DEFAULT_LEAD_CONFIG.apiUrl,
    cookie: body.leadCheckCookie || DEFAULT_LEAD_CONFIG.cookie,
    datas: body.leadCheckDatas || DEFAULT_LEAD_CONFIG.datas,
    intervalSeconds: Number(body.leadCheckInterval) || DEFAULT_LEAD_CONFIG.intervalSeconds,
    maxAttempts: Number(body.leadCheckMaxAttempts) || DEFAULT_LEAD_CONFIG.maxAttempts,
    checkScreen: Number(body.leadCheckScreen) || DEFAULT_LEAD_CONFIG.checkScreen || 4,
  };
  const hideUntilTarget = Boolean(body.hideUntilTarget ?? body.hideBrowser);
  const hideUntilLead = Boolean(body.hideUntilLead);

  // Dọn dẹp các session cũ đã đóng hoặc zombie trước khi khởi chạy
  await pruneDeadGoLoginSessions();

  const count = concurrency;
  const results = [], warnings = [];

  // Thu thập proxy: ưu tiên từ request (txtDashboardProxy), bỏ qua proxy đã dùng
  const candidateProxies = [];
  const hasProxyInput = Boolean(body.proxyList?.trim() || proxyQueue.available.length);
  const proxyType = body.proxyType ?? 'socks5';
  const usedProxyLines = new Set(proxyQueue.used.map((l) => l.trim()));
  const candidatePoolTarget = Math.max(count * 3, count + 20);
  if (body.proxyList) {
    for (const [i, line] of body.proxyList.split(/\r?\n/).entries()) {
      if (candidateProxies.length >= candidatePoolTarget) break;
      if (usedProxyLines.has(line.trim())) continue;
      try {
        const p = parseProxyLine(line, i + 1, proxyType);
        if (p && !candidateProxies.some(existingProxy => proxyIdentity(existingProxy) === proxyIdentity(p))) {
          candidateProxies.push(p);
        }
      } catch {}
    }
  }

  // Nếu chưa đủ proxy cho các luồng, tự động rút từ proxyQueue.available
  if (candidateProxies.length < candidatePoolTarget) {
    for (const line of proxyQueue.available) {
      if (candidateProxies.length >= candidatePoolTarget) break;
      try {
        const p = parseProxyLine(line.trim(), candidateProxies.length + 1, proxyType);
        if (p && !isProxyCurrentlyActive(p) && !candidateProxies.some(existingProxy => proxyIdentity(existingProxy) === proxyIdentity(p))) {
          p._queueLine = line;
          candidateProxies.push(p);
        }
      } catch {}
    }
  }

  const usageHistory = await readProxyUsageHistory();
  const usedExitIps = new Set(
    Object.values(usageHistory.proxies)
      .map((entry) => {
        if (!entry.exitIp) return null;
        if (entry.status !== 'success') return null;
        return entry.websiteUrl ? `${entry.exitIp}::${safeNormalizeUrl(entry.websiteUrl)}` : entry.exitIp;
      })
      .filter(Boolean)
  );

  const gologinWorkers = [];
  const occupiedSlots = new Set([...activeBrowsers].map(s => s.slot || (s.tileIndex + 1)));

  for (let i = 0; i < count; i++) {
    const slotOfferUrl = (offerUrls && offerUrls.length > 0) ? offerUrls[i % offerUrls.length] : websiteUrl;
    const offerNum = (offerUrls && offerUrls.length > 0) ? (i % offerUrls.length) + 1 : 1;
    const normOfferUrl = slotOfferUrl ? safeNormalizeUrl(slotOfferUrl) : '';

    let slot = 1;
    while (occupiedSlots.has(slot)) slot++;
    occupiedSlots.add(slot);
    const tileIndex = slot - 1;

    let assignedProxy = null;
    let actualExitIp = null;

    // Duyệt qua candidateProxies để tìm một proxy sống và chưa bị trùng IP (tối đa 20 lần thử)
    let checkAttempts = 0;
    while (candidateProxies.length > 0 && checkAttempts++ < 20) {
      const candidate = candidateProxies.shift();
      if (isProxyCurrentlyActive(candidate)) continue;
      acquireProxyLock(candidate);

      let verifiedIp = null;
      try {
        verifiedIp = await checkProxyExitIp(candidate);
      } catch {}

      if (!verifiedIp) {
        // Proxy không kết nối được qua socks -> giải phóng để không dùng proxy chết
        releaseProxyLock(candidate);
        continue;
      }

      if (isExitIpCurrentlyInUse(verifiedIp)) {
        releaseProxyLock(candidate);
        warnings.push(`Proxy ${candidate.server} có IP exit (${verifiedIp}) đang chạy ở luồng khác; bỏ qua.`);
        continue;
      }

      const keyWithUrl = normOfferUrl ? `${verifiedIp}::${normOfferUrl}` : verifiedIp;
      if (body.checkDuplicate !== false && usedExitIps.has(keyWithUrl)) {
        releaseProxyLock(candidate);
        warnings.push(`Proxy ${candidate.server} có IP exit (${verifiedIp}) đã được dùng trước đây cho offer ${slotOfferUrl}; bỏ qua (Check duplicate).`);
        continue;
      }

      // Proxy sống và không trùng IP
      assignedProxy = candidate;
      actualExitIp = verifiedIp;
      activeExitIpLocks.add(verifiedIp);
      usedExitIps.add(keyWithUrl);

      break;
    }

    if (!assignedProxy && hasProxyInput) {
      warnings.push(`Slot ${slot}: Không còn proxy hợp lệ; không mở bằng IP thật của máy.`);
      continue;
    }
    if (!assignedProxy) {
      actualExitIp = 'Direct';
      const directKey = normOfferUrl ? `Direct::${normOfferUrl}` : 'Direct';
      if (isExitIpCurrentlyInUse('Direct')) {
        warnings.push(`Slot ${slot}: Đã có luồng chạy Direct (IP thật); dừng mở để tránh trùng IP.`);
        continue;
      }
      if (body.checkDuplicate !== false && usedExitIps.has(directKey)) {
        warnings.push(`Slot ${slot}: IP Direct (IP thật máy) đã được dùng trước đây cho offer này; dừng mở (Check duplicate).`);
        continue;
      }
      activeExitIpLocks.add('Direct');
      usedExitIps.add(directKey);
    }

    gologinWorkers.push({
      slot,
      tileIndex,
      assignedProxy,
      actualExitIp,
      slotOfferUrl,
      offerNum,
    });
  }

  // Khởi chạy song song (Parallel) các luồng GoLogin với giãn cách nhẹ giữa các lần gọi daemon
  await Promise.all(gologinWorkers.map(async (worker, workerIdx) => {
    if (workerIdx > 0) {
      const staggerMs = Math.max(800, (delayStart > 0 ? delayStart * 1000 : 800));
      await new Promise(r => setTimeout(r, workerIdx * staggerMs));
    }
    if (autoRefill.stopRequested || !autoRefill.enabled) {
      releaseProxyLock(worker.assignedProxy, worker.actualExitIp);
      if (worker.actualExitIp === 'Direct') activeExitIpLocks.delete('Direct');
      return;
    }
    try {
      const launchedSession = await openBrowserViaLocalEngine({
        tileIndex: worker.tileIndex,
        slot: worker.slot,
        proxy: worker.assignedProxy,
        verifiedExitIp: worker.actualExitIp,
        websiteUrl: worker.slotOfferUrl,
        offer: worker.offerNum,
        autofillRecords,
        autoSubmit: body.autoSubmitForm !== false,
        leadConfig,
        scriptSteps,
        captchaApiKey,
        completeText,
        timeLimit,
        delayStop,
        scriptPath,
        hideUntilTarget,
        hideUntilLead,
        antiFingerprint,
        deviceProfile: body.deviceProfile || 'macos',
        totalCount: concurrency,
      });

      results.push({
        status: 'ok',
        slot: worker.slot,
        offer: worker.offerNum,
        mode: 'local-zero-profile',
        profileId: launchedSession.profileId || worker.profileId,
      });
      if (worker.assignedProxy?._queueLine) {
        const queueIndex = proxyQueue.available.indexOf(worker.assignedProxy._queueLine);
        if (queueIndex !== -1) {
          proxyQueue.available.splice(queueIndex, 1);
          proxyQueue.used.push(worker.assignedProxy._queueLine);
          void saveProxyQueue();
        }
      }
      if (worker.assignedProxy && worker.actualExitIp) {
        const pKey = createProxyUsageKey(worker.assignedProxy, 1, worker.slotOfferUrl);
        usageHistory.proxies[pKey] = {
          status: 'success',
          proxy: worker.assignedProxy.server,
          exitIp: worker.actualExitIp,
          websiteUrl: worker.slotOfferUrl,
          offerNumber: worker.offerNum,
          profileId: launchedSession.profileId,
          attemptedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        void persistProxyUsageHistory(usageHistory).catch(() => {});
      }
    } catch (err) {
      if (worker.assignedProxy) {
        releaseProxyLock(worker.assignedProxy, worker.actualExitIp);
        const pKey = createProxyUsageKey(worker.assignedProxy, 1, worker.slotOfferUrl);
        usageHistory.proxies[pKey] = {
          status: 'failed',
          proxy: worker.assignedProxy.server,
          exitIp: worker.actualExitIp,
          websiteUrl: worker.slotOfferUrl,
          offerNumber: worker.offerNum,
          profileId: worker.profileId,
          reason: err.message,
          attemptedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        };
        void persistProxyUsageHistory(usageHistory).catch(() => {});
      } else if (worker.actualExitIp === 'Direct') {
        activeExitIpLocks.delete('Direct');
      }
      warnings.push(`Slot ${worker.slot}: ${err.message}`);
    }
  }));
  return { results, warnings };
}

async function launchUserRequestedBrowsers(requestBody) {
  autoRefill.stopRequested = false;
  autoRefill.enabled = true;
  const body = JSON.parse(requestBody);
  const activeBeforeLaunch = activeBrowsers.size;
  const result = await launchRequestedBrowsers(requestBody);
  const countParam = (body.requestedCount !== undefined && body.requestedCount !== '')
    ? body.requestedCount
    : body.concurrency;
  const requestedCount = (countParam === undefined || countParam === '')
    ? Math.min(maxAliveBrowsers, selectProxies(body.proxyList, body.proxyType ?? 'socks5', '').length)
    : Number(countParam);

  if (activeBrowsers.size > 0) {
    autoRefill.settings = {
      proxyList: body.proxyList,
      proxyType: body.proxyType ?? 'socks5',
      websiteUrl: body.websiteUrl,
      websiteUrl2: body.websiteUrl2,
      websiteUrl3: body.websiteUrl3,
      websiteUrl4: body.websiteUrl4,
      offerUrls: body.offerUrls || (body.websiteUrl3 || body.websiteUrl4 ? [body.websiteUrl, body.websiteUrl2, body.websiteUrl3, body.websiteUrl4].filter(Boolean) : undefined),
      checkDuplicate: body.checkDuplicate !== false,
      autofillData: body.autofillData,
      autoSubmitForm: body.autoSubmitForm !== false,
      enableLeadCheck: body.enableLeadCheck !== false,
      leadCheckApiUrl: body.leadCheckApiUrl,
      leadCheckCookie: body.leadCheckCookie,
      leadCheckDatas: body.leadCheckDatas,
      leadCheckInterval: body.leadCheckInterval,
      leadCheckMaxAttempts: body.leadCheckMaxAttempts,
      scriptPath: body.scriptPath ?? '',
      captchaApiKey: body.captchaApiKey ?? '',
      completeText: body.completeText ?? '',
      timeLimit: Math.max(0, Number(body.timeLimit) || 0),
      delayStart: Math.max(0, Number(body.delayStart) || 0),
      delayStop: Math.max(0, Number(body.delayStop) || 0),
      limitRun: Math.max(0, Number(body.limitRun) || 0),
      antiFpCanvas: Boolean(body.antiFpCanvas),
      antiFpClientRects: Boolean(body.antiFpClientRects),
      antiFpWebgl: Boolean(body.antiFpWebgl),
      antiFpWebrtc: Boolean(body.antiFpWebrtc),
      hideUntilTarget: Boolean(body.hideUntilTarget ?? body.hideBrowser),
      hideBrowser: Boolean(body.hideUntilTarget ?? body.hideBrowser),
      hideUntilLead: Boolean(body.hideUntilLead),
    };
    autoRefill.targetCount = Math.min(
      maxAliveBrowsers,
      Math.max(autoRefill.targetCount, activeBeforeLaunch + requestedCount, activeBrowsers.size),
    );
    autoRefill.message = `Tự bù ${autoRefill.enabled ? 'đang bật' : 'đang tắt'}: ${activeBrowsers.size}/${autoRefill.targetCount} trình duyệt.`;
    void saveAutoRefillSettings();
    if (autoRefill.enabled) queueAutomaticRefill();
  }

  return { ...result, autoRefillEnabled: autoRefill.enabled };
}

/**
 * Xếp một lần kiểm tra slot sau khi profile bị đóng và mở profile thay thế nếu cần.
 *
 * @return {void} Không trả về giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
export function queueAutomaticRefill(delayMs = 0) {
  if (autoRefill.stopRequested || !autoRefill.enabled || !autoRefill.settings || autoRefill.queued) return;
  autoRefill.queued = true;
  void enqueueExclusively(async () => {
    autoRefill.queued = false;
    if (autoRefill.stopRequested || !autoRefill.enabled || !autoRefill.settings) return;

    const waitMs = (autoRefill.sequential || activeBrowsers.size === 0) ? delayMs : 0;
    if (waitMs > 0) {
      autoRefill.message = `Chế độ tuần tự: chờ ${waitMs / 1000}s trước khi mở phiên tiếp theo…`;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      if (autoRefill.stopRequested || !autoRefill.enabled || !autoRefill.settings) return;
    }

    const activeSettings = autoRefill.settings;
    const configuredOffers = [];
    if (Array.isArray(activeSettings.offerUrls) && activeSettings.offerUrls.length > 0) {
      configuredOffers.push(...activeSettings.offerUrls.map((u) => normalizeUrl(u)).filter(Boolean));
    } else {
      const u1 = activeSettings.websiteUrl ? normalizeUrl(activeSettings.websiteUrl) : '';
      const u2 = activeSettings.websiteUrl2 ? normalizeUrl(activeSettings.websiteUrl2) : '';
      const u3 = activeSettings.websiteUrl3 ? normalizeUrl(activeSettings.websiteUrl3) : '';
      const u4 = activeSettings.websiteUrl4 ? normalizeUrl(activeSettings.websiteUrl4) : '';
      if (!u2 && u1 && /[\r\n,]/.test(activeSettings.websiteUrl)) {
        const parts = activeSettings.websiteUrl.split(/[\r\n,]+/).map((u) => u.trim()).filter(Boolean);
        for (const p of parts) {
          try {
            const norm = normalizeUrl(p);
            if (!configuredOffers.includes(norm)) configuredOffers.push(norm);
          } catch {}
        }
      } else {
        if (u1) configuredOffers.push(u1);
        if (u2 && !configuredOffers.includes(u2)) configuredOffers.push(u2);
        if (u3 && !configuredOffers.includes(u3)) configuredOffers.push(u3);
        if (u4 && !configuredOffers.includes(u4)) configuredOffers.push(u4);
      }
    }
    const offerCount = Math.max(1, configuredOffers.length);
    const isMultiOffer = offerCount >= 2;
    const seqTarget = autoRefill.sequential ? (isMultiOffer ? offerCount : 1) : autoRefill.targetCount;
    const neededSlots = Math.min(seqTarget, maxAliveBrowsers) - activeBrowsers.size;
    if (neededSlots <= 0) return;

    autoRefill.message = autoRefill.sequential
      ? (isMultiOffer ? `Chế độ tuần tự ${offerCount} luồng: đang mở phiên tiếp theo…` : 'Chế độ tuần tự: đang mở phiên tiếp theo…')
      : `Đang tìm proxy mới để bù ${neededSlots} slot trống…`;

    // Dispatch đến remote agents có enabled + còn slot + còn sống
    let remoteDispatched = 0;
    pruneStaleAgents();
    for (const [, agent] of remoteAgents) {
      if (remoteDispatched >= neededSlots) break;
      if (!agent.enabled || agent.freeSlots <= 0) continue;
      if (dispatchOneTaskToAgent(agent, activeSettings)) remoteDispatched++;
    }
    const localNeeded = neededSlots - remoteDispatched;
    if (localNeeded <= 0) {
      autoRefill.message = `Đã phân phát ${remoteDispatched} task cho agent từ xa.`;
      return;
    }

    let assignedStreamRoles = null;
    if (isMultiOffer) {
      assignedStreamRoles = [];
      const currentOfferCounts = new Map();
      for (let k = 1; k <= offerCount; k++) {
        const c = [...activeBrowsers].filter((s) => (s.offerNumber ?? s.streamRole ?? 1) === k).length;
        currentOfferCounts.set(k, c);
      }
      for (let i = 0; i < localNeeded; i++) {
        let minOffer = 1;
        let minCount = Infinity;
        for (let k = 1; k <= offerCount; k++) {
          const c = currentOfferCounts.get(k) || 0;
          if (c < minCount) {
            minCount = c;
            minOffer = k;
          }
        }
        assignedStreamRoles.push(minOffer);
        currentOfferCounts.set(minOffer, minCount + 1);
      }
    }

    let result;
    if (activeSettings.browserMode === 'Gologin') {
      result = await launchGoLoginBrowsers(JSON.stringify({
        ...activeSettings,
        offerUrls: configuredOffers,
        websiteUrl: configuredOffers[0] || activeSettings.websiteUrl,
        websiteUrl2: configuredOffers[1] || activeSettings.websiteUrl2,
        websiteUrl3: configuredOffers[2] || activeSettings.websiteUrl3,
        websiteUrl4: configuredOffers[3] || activeSettings.websiteUrl4,
        requestedCount: localNeeded,
      }));
    } else {
      result = await launchRequestedBrowsers(JSON.stringify({
        ...activeSettings,
        offerUrls: configuredOffers,
        websiteUrl: configuredOffers[0] || activeSettings.websiteUrl,
        websiteUrl2: configuredOffers[1] || activeSettings.websiteUrl2,
        websiteUrl3: configuredOffers[2] || activeSettings.websiteUrl3,
        websiteUrl4: configuredOffers[3] || activeSettings.websiteUrl4,
        requestedCount: localNeeded,
      }), { layoutTarget: seqTarget, assignedStreamRoles });
    }
    autoRefill.message = activeBrowsers.size >= seqTarget
      ? `Đã bù đủ ${activeBrowsers.size}/${seqTarget} trình duyệt.`
      : result.warnings.at(-1) ?? `Hiện mở ${activeBrowsers.size}/${seqTarget}; không còn proxy phù hợp để bù.`;
  }).catch((error) => {
    autoRefill.queued = false;
    autoRefill.message = `Tự bù gặp lỗi: ${error.message.split('\n')[0]}`;
  });
}

/**
 * Bật hoặc tắt việc tự mở profile thay thế khi cửa sổ bị đóng.
 *
 * @param {string} requestBody JSON có thuộc tính enabled dạng boolean.
 * @return {object} Trạng thái tự bù mới.
 * @throws {Error} Khi yêu cầu không có enabled dạng boolean.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
function updateAutoRefill(requestBody) {
  const body = JSON.parse(requestBody);
  if (typeof body.enabled !== 'boolean') throw new Error('Trạng thái tự bù phải là true hoặc false.');
  autoRefill.enabled = body.enabled;
  if (!body.enabled) {
    autoRefill.sequential = false;
    autoRefill.settings = null;
    autoRefill.targetCount = 0;
    autoRefill.queued = false;
  } else if (body.targetCount > 0) {
    autoRefill.targetCount = Math.min(body.targetCount, maxAliveBrowsers);
    void saveAutoRefillSettings();
  }
  autoRefill.message = autoRefill.enabled
    ? 'Đã bật tự bù; app sẽ mở profile khác khi có slot trống.'
    : 'Đã tắt tự bù; các trình duyệt đang mở vẫn tiếp tục chạy.';
  if (autoRefill.enabled) queueAutomaticRefill();
  return { results: [autoRefill.message], warnings: [], autoRefillEnabled: autoRefill.enabled };
}

/**
 * Trả trạng thái tự bù và IP đã xác minh của từng cửa sổ Chrome đang mở.
 *
 * @return {object} Trạng thái hiện tại của trình duyệt và cơ chế tự bù.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
function getAutoRefillStatus() {
  return {
    enabled: autoRefill.enabled,
    sequential: autoRefill.sequential,
    activeCount: activeBrowsers.size,
    targetCount: autoRefill.targetCount,
    message: autoRefill.message,
    chromeSessions: [...activeBrowsers]
      .filter((session) => !session.isClosed && session.chromeVersion && (session.exitIp || session.isGoLogin))
      .map((session) => ({
        slot: session.slot ?? (session.tileIndex + 1),
        version: session.chromeVersion,
        deviceProfile: session.deviceProfile ?? 'windows',
        deviceSummary: session.deviceSummary ?? null,
        exitIp: session.exitIp ?? (session.isGoLogin ? 'GoLogin' : null),
        proxy: session.proxyServer ?? session.proxyKey ?? null,
        assignedEmail: session.assignedEmail ?? null,
        assignedPass: session.assignedPass ?? (session.currentRecord?.pass || session.currentRecord?.password || '******'),
        assignedRecover: session.assignedRecover ?? (session.currentRecord?.recover || session.currentRecord?.recoveryEmail || '--'),
        autofillRecord: session.autofillRecord ?? null,
        autofillFields: session.autofillFields ?? 0,
        autofillError: session.autofillError ?? null,
        completedScreens: session.completedScreens ?? 0,
        currentScreen: session.currentScreen ?? ((session.completedScreens ?? 0) + 1),
        pageJumps: session.pageJumps ?? 0,
        screenReached: session.screenReached ?? session.currentScreen ?? 1,
        leadCheckStatus: session.leadCheckStatus ?? null,
        leadCheckMessage: session.leadCheckMessage ?? null,
        extensions: session.extensions ?? null,
        streamRole: session.streamRole ?? 1,
        streamLabel: session.streamLabel ?? '',
        offerNumber: session.offerNumber ?? session.streamRole ?? 1,
        websiteUrl: session.websiteUrl ?? null,
        aiRunning: Boolean(session.aiAssistRunning),
        aiStatus: session.aiAssistRunning ? 'Đang phân tích form bằng AI...' : (session.autofillFields ? `Đã điền ${session.autofillFields} trường` : 'Sẵn sàng'),
        action: session.aiAssistRunning
          ? '🤖 AI đang phân tích & điền form'
          : (session.lastActionText || (session.autofillFields ? `Đã điền ${session.autofillFields} ô` : (session.websiteUrl ? 'Đang duyệt' : 'Running'))),
        lastLog: (session.logs && session.logs.length > 0) ? session.logs[session.logs.length - 1] : null,
      }))
      .sort((firstSession, secondSession) => firstSession.slot - secondSession.slot),
    leadStats: Object.fromEntries(leadIpStatsMap),
  };
}

/**
 * Kiểm tra từng proxy qua HTTPS, hỗ trợ cả SOCKS5 có xác thực và báo IP exit.
 *
 * @param {string} requestBody Nội dung JSON nhận từ giao diện.
 * @return {Promise<{results: string[], warnings: string[]}>} Kết quả từng proxy.
 * @throws {Error} Khi danh sách proxy không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
async function checkRequestedProxies(requestBody) {
  const body = JSON.parse(requestBody);
  const selectedProxies = selectProxies(body.proxyList, body.proxyType ?? 'socks5', body.requestedCount);
  const checked = await Promise.all(selectedProxies.map(async (proxy, index) => {
    try {
      const info = await requestProxyIpInfo(proxy);
      return { index, proxy, ip: info.ip, country: info.country, city: info.city, org: info.org };
    } catch (error) {
      return { index, proxy, error: error.message.split('\n')[0] };
    }
  }));

  return buildProxyCheckReport(checked);
}

/**
 * Dựng báo cáo kiểm tra proxy: cờ trùng IP exit / trùng dòng và CSV để xem lại.
 *
 * Hàm thuần, không gọi mạng, nên kiểm thử được độc lập. Chỉ chẩn đoán danh sách proxy —
 * không mở trang đích và không đụng tới sổ IP đã dùng.
 *
 * @param {object[]} checked Kết quả đã kiểm tra từng proxy (index, proxy, ip?, country?, city?, org?, error?).
 * @return {{results: string[], csv: string, warnings: string[]}} Dòng hiển thị, CSV và cảnh báo.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-10
 */
export function buildProxyCheckReport(checked) {
  const ipCounts = new Map();
  const serverCounts = new Map();
  for (const { proxy, ip, error } of checked) {
    serverCounts.set(proxy.server, (serverCounts.get(proxy.server) ?? 0) + 1);
    if (!error && ip) ipCounts.set(ip, (ipCounts.get(ip) ?? 0) + 1);
  }
  const noteFor = ({ proxy, ip, error }) => {
    const notes = [];
    if (!error && ip && ipCounts.get(ip) > 1) notes.push('TRÙNG IP');
    if (serverCounts.get(proxy.server) > 1) notes.push('TRÙNG DÒNG');
    return notes;
  };

  const serverWidth = Math.max(0, ...checked.map(({ proxy }) => proxy.server.length));
  const results = checked.map((row) => {
    const { index, proxy, ip, country, city, org, error } = row;
    const label = `${String(index + 1).padStart(3)}. ${proxy.server.padEnd(serverWidth)}`;
    const note = noteFor(row);
    const suffix = note.length ? `  [${note.join(', ')}]` : '';
    const base = error
      ? `${label}  LỖI  ${error}`
      : `${label}  SỐNG  ${ip}  ${country ?? '??'}  ${city ?? ''}  ${org ?? ''}`.trimEnd();
    return base + suffix;
  });

  const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const csv = [
    ['stt', 'proxy', 'trang_thai', 'ip_exit', 'quoc_gia', 'thanh_pho', 'to_chuc', 'ghi_chu'].map(csvCell).join(','),
    ...checked.map((row) => {
      const { index, proxy, ip, country, city, org, error } = row;
      return [
        index + 1, proxy.server, error ? 'LOI' : 'SONG',
        error ? '' : ip, error ? '' : country, error ? '' : city, error ? '' : org,
        [...noteFor(row), error || ''].filter(Boolean).join('; '),
      ].map(csvCell).join(',');
    }),
  ].join('\n');

  const alive = checked.filter(({ error }) => !error).length;
  const duplicateIps = [...ipCounts.values()].filter((count) => count > 1).length;
  const warnings = [`${alive}/${checked.length} proxy kết nối được và trả về IP.`];
  if (duplicateIps) warnings.push(`${duplicateIps} IP exit bị nhiều proxy dùng chung (cột ghi chú [TRÙNG IP]).`);
  return { results, csv, warnings };
}

/**
 * Yêu cầu ipinfo qua proxy và trả về thông tin địa chỉ IP bên ngoài.
 *
 * @param {object} proxy Cấu hình proxy đã được phân tích.
 * @return {Promise<object>} Thông tin JSON do ipinfo trả về.
 * @throws {Error} Khi proxy không kết nối được hoặc endpoint trả mã lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
function requestProxyIpInfo(proxy) {
  const proxyUrl = new URL(proxy.server);
  if (proxy.username) proxyUrl.username = proxy.username;
  if (proxy.password) proxyUrl.password = proxy.password;
  const agent = proxyUrl.protocol === 'socks5:'
    ? new SocksProxyAgent(proxyUrl)
    : new HttpsProxyAgent(proxyUrl);

  const fetchJson = (urlStr, timeoutMs = 4000) => new Promise((resolve, reject) => {
    const isHttps = urlStr.startsWith('https:');
    const reqFn = isHttps ? requestHttps : requestHttp;
    const proxyRequest = reqFn(urlStr, { agent, timeout: timeoutMs }, (response) => {
      let responseBody = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { responseBody += chunk; });
      response.on('end', () => {
        if (response.statusCode !== 200) {
          const authHint = response.statusCode === 407 ? ' — proxy từ chối xác thực user/password.' : '';
          reject(new Error(`HTTP ${response.statusCode}${authHint}`));
          return;
        }
        try {
          resolve(JSON.parse(responseBody));
        } catch {
          reject(new Error('Dịch vụ kiểm tra IP trả về dữ liệu không hợp lệ.'));
        }
      });
    });
    proxyRequest.on('timeout', () => proxyRequest.destroy(new Error(`Timeout tra IP sau ${timeoutMs}ms.`)));
    proxyRequest.on('error', reject);
  });

  return fetchJson(checkUrl, 4000).catch(async () => {
    // Fallback qua ip-api.com khi ipinfo.io bị quá tải hoặc lỗi
    const ipApi = await fetchJson('http://ip-api.com/json', 5000);
    return {
      ip: ipApi.query,
      country: ipApi.countryCode,
      city: ipApi.city,
      region: ipApi.regionName,
      timezone: ipApi.timezone,
      loc: `${ipApi.lat},${ipApi.lon}`,
    };
  });
}

/**
 * Đóng mọi trình duyệt do app mở.
 *
 * Playwright chạy Chromium với --no-startup-window nên đóng hết cửa sổ không làm tiến
 * trình thoát — nó nằm chờ trên CDP pipe và vẫn hiện icon dưới Dock. Phải gọi close().
 *
 * @return {Promise<{results: string[], warnings: string[]}>} Số trình duyệt đã đóng.
 * @throws {Error} Khi hệ thống không thể xử lý thao tác đóng phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function closeActiveBrowsers() {
  const sessions = [...activeBrowsers];
  autoRefill.stopRequested = true;
  autoRefill.enabled = false;
  autoRefill.sequential = false;
  autoRefill.settings = null;
  autoRefill.targetCount = 0;
  autoRefill.queued = false;
  // Xóa settings đã lưu để không tự khởi động lại sau khi stop chủ động
  void writeFile(autoRefillSettingsPath, '{}', 'utf8').catch(() => {});
  autoRefill.message = 'Đã dừng toàn bộ luồng; tự bù đã tắt.';
  exclusiveQueue = Promise.resolve(); // Giải phóng ngay hàng đợi để không bị nghẽn

  for (const session of sessions) {
    session.suppressAutoRefill = true;
    session.isClosed = true;
    if (session._monitorInterval) {
      clearInterval(session._monitorInterval);
      session._monitorInterval = null;
    }
    if (session._autofillTimer) {
      clearInterval(session._autofillTimer);
      session._autofillTimer = null;
    }
  }
  await Promise.allSettled(sessions.map(async (session) => {
    session.suppressAutoRefill = true;
    session.isClosed = true;
    if (session.isLocalEngine) {
      if (session.browser && typeof session.browser.close === 'function') {
        await session.browser.close().catch(() => {});
      }
      await session._relay?.close().catch(() => {});
      await (session._localStopPromise ?? stopLocalProfileBrowser(session._proc, session.profilePath));
      return;
    }
    if (session.isGoLogin && session.profileId) {
      if (session.browser && typeof session.browser.close === 'function') {
        await session.browser.close().catch(() => {});
      }
      await requestGoLoginProfileStop(session);
      return;
    }
    try {
      await Promise.race([
        session.browser?.close?.(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), 2000)),
      ]);
    } catch {}
    if (session.proxyKey) {
      await executeFile('pkill', ['-9', '-f', `user-data-dir.*${session.proxyKey}`]).catch(() => {});
    }
  }));

  // Chỉ đóng những phiên app quản lý; không đụng vào Orbita do người dùng tự mở.
  await executeFile('pkill', ['-9', '-f', 'chrome-regular-builds']).catch(() => {});
  await executeFile('pkill', ['-9', '-f', 'user-data-dir.*chrome-profiles']).catch(() => {});
  await executeFile('pkill', ['-9', '-f', 'user-data-dir.*AutoLeadPC']).catch(() => {});
  await executeFile('pkill', ['-9', '-f', 'user-data-dir.*Profiles/gologin_']).catch(() => {});

  // Pass 2: bắt các browser vừa được add vào activeBrowsers trong lúc pass 1 đang chạy
  await new Promise((r) => setTimeout(r, 800));
  const lateComers = [...activeBrowsers];
  for (const s of lateComers) {
    s.suppressAutoRefill = true;
    s.isClosed = true;
    if (s._monitorInterval) { clearInterval(s._monitorInterval); s._monitorInterval = null; }
    if (s._autofillTimer) { clearInterval(s._autofillTimer); s._autofillTimer = null; }
    await (s.browser ?? s.context)?.close?.().catch(() => {});
  }

  activeBrowsers.clear();
  activeProxyLocks.clear();
  activeExitIpLocks.clear();

  return {
    results: [sessions.length > 0
      ? 'Đã đóng ' + sessions.length + ' trình duyệt và dừng hẳn toàn bộ luồng.'
      : 'Đã đóng toàn bộ trình duyệt trên màn hình và dừng hẳn.'],
    warnings: [],
    autoRefillEnabled: false,
  };
}

/**
 * Trả danh sách IP exit đã dùng để giao diện hiện bảng.
 *
 * @return {Promise<{ips: object[], results: string[], warnings: string[]}>} Danh sách IP và dòng tóm tắt.
 * @throws {Error} Khi không đọc được lịch sử proxy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
async function listUsedExitIps() {
  const usageHistory = await readProxyUsageHistory();
  const ips = buildUsedExitIpList(usageHistory);
  return {
    ips,
    results: [ips.length > 0
      ? `Đã dùng ${ips.length} IP exit; các lượt mở sau sẽ không dùng lại các IP này.`
      : 'Chưa có IP exit nào trong lịch sử.'],
    warnings: [],
  };
}

/**
 * Xóa toàn bộ lịch sử proxy và IP đã dùng để người dùng có thể sử dụng lại từ đầu.
 *
 * @return {Promise<{results: string[], warnings: string[]}>} Kết quả xóa.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
async function clearUsedProxyHistory() {
  const usageHistory = await readProxyUsageHistory();
  const count = Object.keys(usageHistory.proxies).length;
  await persistProxyUsageHistory({ version: 1, proxies: {} });
  resetMultiOfferState();
  void saveDualStreamState();
  try {
    const profilesDir = join(chromeProfileDirectory, 'stable');
    await rm(profilesDir, { recursive: true, force: true });
  } catch {}
  return {
    results: [`Đã xóa toàn bộ lịch sử (${count} proxy/IP đã dùng). Tất cả proxy có thể dùng lại bình thường.`],
    warnings: [],
  };
}

/**
 * Tải các bản Chrome for Testing vào kho thử nghiệm riêng.
 *
 * @param {string} requestBody JSON gồm số phiên bản cần có.
 * @return {Promise<{results: string[], warnings: string[]}>} Các bản Chrome đang có trên máy.
 * @throws {Error} Khi không gọi được danh mục Google hoặc giải nén thất bại.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
async function downloadRealChromeVersions(requestBody) {
  const body = requestBody ? JSON.parse(requestBody) : {};
  const versionCount = body.chromeVersionCount === undefined || body.chromeVersionCount === ''
    ? 10
    : Number(body.chromeVersionCount);
  // ponytail: tiến độ chỉ ra stdout, UI đứng chờ tới khi xong; thêm /state nếu thấy lâu.
  const { builds, downloadedVersions, warnings } = await installChromeVersions({
    versionCount,
    onProgress: (message) => console.log(message),
  });

  return {
    results: [
      downloadedVersions.length > 0
        ? `Đã tải ${downloadedVersions.length} bản: ${downloadedVersions.join(', ')}.`
        : 'Không cần tải thêm; các bản yêu cầu đã có trên máy.',
      `Kho Chrome for Testing có ${builds.length} bản: ${builds.map((build) => build.version).join(', ')}.`,
    ],
    warnings,
  };
}

/**
 * Các tên binary có thể có trong Contents/MacOS của một bản Chrome.
 *
 * Kênh Beta/Dev/Canary mang tên kênh trong tên binary; bản stable và bản lưu theo số phiên
 * bản dùng tên trơn, còn bản tải từ Chrome for Testing dùng tên riêng nên phải thử cả hai.
 *
 * @param {string} channel Tên kênh, hoặc số phiên bản với bản lưu theo version.
 * @return {string[]} Các tên binary cần thử, theo thứ tự ưu tiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-15
 */
export function chromeExecutableNames(channel) {
  if (channel === 'stable' || /^\d+(?:\.\d+){0,3}$/.test(channel)) {
    return ['Google Chrome', 'Google Chrome for Testing'];
  }
  return [`Google Chrome ${channel[0].toUpperCase()}${channel.slice(1)}`];
}

/**
 * Đọc binary và phiên bản của một kênh Google Chrome đã cài trên macOS.
 *
 * @param {string} appPath Đường dẫn ứng dụng của kênh Chrome.
 * @param {string} channel Tên kênh để gắn với phiên mở.
 * @return {Promise<{executablePath: string, version: string, major: number, channel: string}>} Kênh Chrome đang cài.
 * @throws {Error} Khi không tìm thấy binary hoặc phiên bản không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
async function readInstalledChromeChannel(appPath, channel) {
  const executableNames = chromeExecutableNames(channel);
  let executablePath;
  for (const executableName of executableNames) {
    const candidatePath = join(appPath, 'Contents', 'MacOS', executableName);
    try {
      await access(candidatePath);
      executablePath = candidatePath;
      break;
    } catch {
      // Tên còn lại sẽ được thử; không tìm thấy tên nào thì báo lỗi bên dưới.
    }
  }
  if (!executablePath) {
    throw new Error(`Không tìm thấy binary Chrome trong ${appPath}.`);
  }
  if (appPath.includes('Chrome for Testing') || executablePath.includes('Chrome for Testing')) {
    throw new Error(`Bỏ qua Chrome for Testing tại ${appPath}.`);
  }
  const infoPath = join(appPath, 'Contents', 'Info.plist');
  const { stdout } = await executeFile('/usr/libexec/PlistBuddy', [
    '-c', 'Print :CFBundleShortVersionString', infoPath,
  ]);
  const version = stdout.trim();
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Phiên bản Google Chrome ${channel} không hợp lệ: ${version}.`);
  }
  return { executablePath, version, major: Number(version.split('.')[0]), channel };
}

/**
 * Liệt kê Chrome thường từ bản 150 trở lên, mỗi major chỉ một bản.
 *
 * @return {Promise<{executablePath: string, version: string, major: number, channel: string}[]>} Các kênh khả dụng.
 * @throws {Error} Khi không tìm thấy kênh Stable mặc định.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-14
 */
export async function listInstalledChromeChannels() {
  const stableApp = installedChromeAppPath;
  const archivedAppNames = await readdir(chromeRegularBuildDirectory).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const channelApps = [
    ...archivedAppNames.sort()
      .map((appName) => {
        const archiveName = appName.match(/^Google Chrome(?: (Beta|Dev|Canary))? (1\d{2}(?:\.\d+){3})\.app$/);
        return archiveName
          ? [(archiveName[1] || 'stable').toLowerCase(), join(chromeRegularBuildDirectory, appName)]
          : null;
      })
      .filter(Boolean),
    ['stable', stableApp],
    ['beta', join(chromeChannelDirectory, 'Google Chrome Beta.app')],
    ['dev', join(chromeChannelDirectory, 'Google Chrome Dev.app')],
    ['canary', join(chromeChannelDirectory, 'Google Chrome Canary.app')],
  ];
  const builds = [];
  const seenMajors = new Set();
  for (const [channel, appPath, minimumMajor = 150] of channelApps) {
    try {
      const build = await readInstalledChromeChannel(appPath, channel);
      if (build.major >= minimumMajor && !seenMajors.has(build.major)) {
        builds.push(build);
        seenMajors.add(build.major);
      }
    } catch (error) {
      if (channel === 'stable') {
        throw new Error(`Không tìm thấy Google Chrome thường tại ${stableApp}: ${error.message}`);
      }
    }
  }
  return builds;
}

/**
 * So sánh hai số phiên bản Chrome dạng 150.0.1234.56.
 *
 * @param {string} left Phiên bản thứ nhất.
 * @param {string} right Phiên bản thứ hai.
 * @return {number} Số âm, 0 hoặc dương khi left nhỏ hơn, bằng hoặc lớn hơn right.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-14
 */
function compareChromeVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Chép profile mẫu (đã cài RoboForm) vào thư mục profile Chrome mới tạo.
 *
 * Chỉ chép khi profile đích chưa từng được Chrome khởi tạo, để không ghi đè dữ liệu cũ.
 * Bỏ qua khi profile mẫu được tạo bằng Chrome mới hơn bản sắp mở, vì Chrome không hỗ trợ
 * mở profile của phiên bản mới hơn.
 *
 * @param {string} userDataDirectory Thư mục profile Chrome đích.
 * @param {{version: string}} build Bản Chrome sẽ mở profile đích.
 * @return {Promise<string|null>} Null nếu đã chép, hoặc lý do không chép để hiện trên giao diện.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-14
 */
async function seedChromeProfileFromTemplate(userDataDirectory, build) {
  try {
    await access(join(userDataDirectory, 'Local State'));
    return 'profile này tạo trước khi có profile mẫu nên không được chép';
  } catch {
    // Profile chưa được Chrome khởi tạo nên có thể nhận dữ liệu mẫu.
  }
  let templateVersion;
  try {
    const metadata = JSON.parse(await readFile(join(chromeTemplateProfileDirectory, chromeTemplateMetadataName), 'utf8'));
    templateVersion = metadata.chromeVersion;
    await access(join(chromeTemplateProfileDirectory, 'Local State'));
  } catch {
    return 'chưa có profile mẫu; bấm "Cài RoboForm cho profile mới"';
  }
  if ((await listProfileExtensionNames(chromeTemplateProfileDirectory)).length === 0) {
    return 'profile mẫu chưa cài extension nào';
  }
  if (compareChromeVersions(templateVersion, build.version) > 0) {
    return `profile mẫu tạo bằng Chrome ${templateVersion}, mới hơn Chrome ${build.version}`;
  }
  await cp(chromeTemplateProfileDirectory, userDataDirectory, {
    recursive: true,
    filter: (source) => !chromeTemplateSkippedNames.has(basename(source)),
  });
  return null;
}

/**
 * Chỉ cho phép xoá thư mục nằm trong kho profile do app quản lý.
 *
 * Chặn cửa trước cho một lệnh `rm -r`: chỉ nhận đường dẫn trong kho profile hoặc trong cây
 * cache song song của nó ở `~/Library/Caches/AutoLeadPC/chrome-profiles`; có `..` là từ chối,
 * nên một giá trị sai không thể xoá thứ khác trên máy.
 *
 * @param {string} candidate Đường dẫn cần kiểm tra.
 * @return {boolean} True khi đường dẫn nằm trong kho profile của app.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-15
 */
export function isManagedChromeProfilePath(candidate) {
  if (typeof candidate !== 'string' || candidate.includes('..')) return false;
  return [chromeProfileDirectory, chromeProfileCacheDirectory].some((root) => {
    const storeRoot = root.endsWith('/') ? root : root + '/';
    return candidate.startsWith(storeRoot) && candidate.length > storeRoot.length;
  });
}

/**
 * Xoá thư mục profile của một phiên sau khi cửa sổ Chrome đã đóng.
 *
 * Mỗi profile là một bản chép đầy đủ của profile mẫu (~179 MB) nên để lại là đĩa phình
 * thêm bấy nhiêu cho mỗi proxy từng thử. Chờ một nhịp cho Chrome ghi xong rồi mới xoá, và
 * thử lại một lần vì Chrome có thể tạo lại file ngay sau lần xoá đầu.
 *
 * @param {string} userDataDirectory Thư mục profile cần xoá.
 * @return {Promise<void>} Hoàn tất khi đã xoá hoặc bỏ qua.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-15
 */
async function removeChromeSessionProfile(userDataDirectory) {
  // Chrome giữ cache ở cây song song trong ~/Library/Caches, xoá profile mà bỏ cache thì
  // cache vẫn tích lại từng lượt.
  const targets = [userDataDirectory, userDataDirectory.replace(chromeProfileDirectory, chromeProfileCacheDirectory)]
    .filter((target) => isManagedChromeProfilePath(target));
  // Thử xóa ngay, sau đó retry nếu Chrome chưa nhả file
  for (const delayMs of [0, 1500, 2500, 10000]) {
    if (delayMs > 0) await new Promise((resolve) => { setTimeout(resolve, delayMs); });
    await Promise.all(targets.map((target) => rm(target, { recursive: true, force: true }).catch(() => {})));
    const remaining = await Promise.all(targets.map((target) => access(target).then(() => true, () => false)));
    if (!remaining.includes(true)) return;
  }
}

/**
 * Xóa tất cả session profiles không có Chrome đang dùng (startup cleanup + có thể gọi lại).
 * Kiểm tra SingletonLock: nếu không có lock → xóa ngay; nếu có lock nhưng PID trong lock đã chết → xóa.
 */
async function cleanupStaleProfiles() {
  const roots = [chromeProfileDirectory, chromeProfileCacheDirectory];
  let removed = 0;
  for (const root of roots) {
    let channelDirs;
    try { channelDirs = await readdir(root); } catch { continue; }
    for (const channel of channelDirs) {
      const channelPath = join(root, channel);
      let versionDirs;
      try { versionDirs = await readdir(channelPath); } catch { continue; }
      for (const version of versionDirs) {
        const versionPath = join(channelPath, version);
        let profileDirs;
        try { profileDirs = await readdir(versionPath); } catch { continue; }
        for (const profileDir of profileDirs) {
          const profilePath = join(versionPath, profileDir);
          const lockPath = join(profilePath, 'SingletonLock');
          let hasActiveLock = false;
          try {
            const lockTarget = await readlink(lockPath);
            // lockTarget = "hostname-PID"
            const pid = parseInt(lockTarget.split('-').pop(), 10);
            if (pid > 0) {
              try { process.kill(pid, 0); hasActiveLock = true; } catch { /* PID dead */ }
            }
          } catch { /* no lock file */ }
          if (!hasActiveLock && isManagedChromeProfilePath(profilePath)) {
            await rm(profilePath, { recursive: true, force: true }).catch(() => {});
            removed++;
          }
        }
      }
    }
  }
  if (removed > 0) console.log(`[Cleanup] Đã xóa ${removed} profile Chrome cũ không còn dùng.`);
}

/**
 * Đọc tên các extension đã cài trong profile mặc định của một thư mục Chrome.
 *
 * Tên lấy từ manifest; tên dạng __MSG_key__ được tra trong _locales theo ngôn ngữ mặc định.
 *
 * @param {string} userDataDirectory Thư mục profile Chrome.
 * @return {Promise<string[]>} Tên extension, hoặc ID nếu không đọc được tên.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-14
 */
async function listProfileExtensionNames(userDataDirectory) {
  const extensionRoot = join(userDataDirectory, 'Default', 'Extensions');
  const extensionIds = (await readdir(extensionRoot).catch(() => [])).filter((id) => /^[a-p]{32}$/.test(id));
  const names = [];
  for (const extensionId of extensionIds) {
    const versions = await readdir(join(extensionRoot, extensionId)).catch(() => []);
    let name = extensionId;
    for (const version of versions) {
      try {
        const versionDirectory = join(extensionRoot, extensionId, version);
        const manifest = JSON.parse((await readFile(join(versionDirectory, 'manifest.json'), 'utf8')).replace(/^\uFEFF/, ''));
        name = manifest.name ?? extensionId;
        const messageKey = /^__MSG_(.+)__$/.exec(name)?.[1];
        if (messageKey) {
          const messages = JSON.parse((await readFile(
            join(versionDirectory, '_locales', manifest.default_locale ?? 'en', 'messages.json'),
            'utf8',
          )).replace(/^\uFEFF/, ''));
          const entry = Object.entries(messages).find(([key]) => key.toLowerCase() === messageKey.toLowerCase());
          name = entry?.[1]?.message ?? extensionId;
        }
        break;
      } catch {
        // Thư mục phiên bản dở dang; thử thư mục khác.
      }
    }
    names.push(name);
  }
  return names;
}

/**
 * Mở profile mẫu không qua proxy để cài và đăng nhập RoboForm một lần.
 *
 * Profile mẫu dùng bản Chrome thấp nhất trên máy để mọi bản Chrome khác mở được bản chép.
 * Sau khi người dùng đóng cửa sổ này, mỗi profile Chrome mới tạo sẽ được chép từ nó.
 *
 * @return {Promise<{results: string[], warnings: string[]}>} Hướng dẫn cho người dùng.
 * @throws {Error} Khi không tìm thấy Chrome đã cài hoặc Chrome không khởi động được.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-14
 */
async function openTemplateProfile() {
  if (templateProfileContext) {
    await templateProfileContext.pages()[0]?.bringToFront().catch(() => {});
    return { results: ['Cửa sổ profile mẫu RoboForm đang mở.'], warnings: [] };
  }
  const builds = await listInstalledChromeChannels();
  const build = builds.toSorted((first, second) => compareChromeVersions(first.version, second.version))[0];
  if (!build) throw new Error('Không tìm thấy Google Chrome từ bản 150 trở lên để mở profile mẫu.');

  await mkdir(chromeTemplateProfileDirectory, { recursive: true, mode: 0o700 });
  let previousVersion;
  try {
    previousVersion = JSON.parse(
      await readFile(join(chromeTemplateProfileDirectory, chromeTemplateMetadataName), 'utf8'),
    ).chromeVersion;
  } catch {
    // Lần đầu tạo profile mẫu.
  }
  const warnings = previousVersion && compareChromeVersions(previousVersion, build.version) > 0
    ? [`Profile mẫu từng mở bằng Chrome ${previousVersion}, mới hơn bản thấp nhất hiện có (${build.version}). `
      + 'Nếu Chrome báo lỗi profile, xóa thư mục chrome-template-profile rồi cài lại RoboForm.']
    : [];

  const context = await chromium.launchPersistentContext(chromeTemplateProfileDirectory, {
    executablePath: build.executablePath,
    ignoreDefaultArgs: ['--disable-extensions', '--disable-background-networking', '--disable-component-update'],
    headless: false,
    viewport: null,
    args: ['--no-first-run', '--no-default-browser-check'],
  });
  const recordedVersion = previousVersion && compareChromeVersions(previousVersion, build.version) > 0
    ? previousVersion
    : build.version;
  await writeFile(
    join(chromeTemplateProfileDirectory, chromeTemplateMetadataName),
    JSON.stringify({ chromeVersion: recordedVersion }),
  );
  templateProfileContext = context;
  context.on('close', () => {
    if (templateProfileContext === context) templateProfileContext = null;
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(`https://chromewebstore.google.com/detail/${roboFormExtensionId}`, {
    waitUntil: 'domcontentloaded',
    timeout: navigationTimeout,
  }).catch(() => {});
  await page.bringToFront().catch(() => {});

  const templateExtensionNames = await listProfileExtensionNames(chromeTemplateProfileDirectory);
  if (templateExtensionNames.length > 0) {
    warnings.push(`Profile mẫu đang có extension: ${templateExtensionNames.join(', ')}. `
      + 'Kiểm tra đã đăng nhập rồi đóng cửa sổ.');
  }
  return {
    results: [
      `Đã mở profile mẫu bằng Chrome ${build.version} (không qua proxy).`,
      'Bấm "Thêm vào Chrome" để cài RoboForm, đăng nhập RoboForm, rồi đóng cửa sổ này.',
      'Từ đó, mỗi profile Chrome mới mà app tạo sẽ có sẵn RoboForm. Profile đã tạo trước đây không thay đổi.',
    ],
    warnings,
  };
}

/**
 * Bắt đầu quy trình kiểm tra lead khi đến/hoàn thành màn đích (mặc định màn 5: DOB/Gender).
 * Gọi API toffers.top kiểm tra IP sock theo chu kỳ cấu hình (mặc định mỗi 30s, tối đa 2 lần).
 * Nếu IP xuất hiện: cho phép autofill tiếp tục các bước sau (Jump Page, Reward, Offerwall).
 * Nếu không xuất hiện sau maxAttempts: đóng Chrome và chuyển sang proxy/sock tiếp theo.
 * Nếu API gặp lỗi (hết hạn Cookie): giữ nguyên Chrome để bảo vệ sock và cảnh báo người dùng.
 *
 * @param {object} session Phiên Chrome đang chạy.
 * @param {object} leadConfig Cấu hình API và thời gian chờ.
 * @return {Promise<void>} Hoàn tất quy trình kiểm tra lead.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
async function startLeadVerification(session, leadConfig) {
  if (session.leadCheckRunning || leadConfig.enabled === false) return;
  session.leadCheckRunning = true;
  session.leadCheckStatus = 'checking';

  const exitIp = session.exitIp;
  const proxyHost = session.proxyServer ? normalizeIpAddress(session.proxyServer) : null;
  const targetIps = [exitIp, proxyHost].filter(Boolean);
  const targetDesc = session.completedScreens
    ? `Màn ${session.completedScreens}`
    : (session.emailScreenNumber ? `màn điền email (Màn ${session.emailScreenNumber})` : (leadConfig.checkScreen ? `Màn ${leadConfig.checkScreen}` : 'sau khi điền form'));
  const slotNum = session.tileIndex !== undefined ? (session.tileIndex + 1) : (session.slot || 1);
  const label = `Slot ${slotNum} [IP: ${exitIp}]`;

  console.log(`[LeadCheck] ${label}: Đã nộp ${targetDesc}. Bắt đầu kiểm tra lead từ toffers.top...`);
  try {

  const updateBadge = (text) => { session.updateBadge?.(text); };

  const intervalSeconds = Math.max(1, Number(leadConfig.intervalSeconds) || DEFAULT_LEAD_CONFIG.intervalSeconds || 15);
  const maxAttempts = Math.max(1, Number(leadConfig.maxAttempts) || DEFAULT_LEAD_CONFIG.maxAttempts || 1);

  const attemptText = maxAttempts > 1 ? `${maxAttempts} lần x ${intervalSeconds}s` : `1 lần ${intervalSeconds}s`;
  session.leadCheckMessage = `Đã nộp ${targetDesc}; bắt đầu chờ kiểm tra lead (${attemptText})...`;
  updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⏳ Chờ lead (${attemptText})...</span>`);

  let leadFound = false;
  let attempt = 0;
  let hasApiError = false;
  let lastApiErrorMessage = '';

  while (attempt < maxAttempts) {
    attempt += 1;
    // Chờ trọn vẹn intervalSeconds (15s) cho mỗi lần kiểm tra, đếm ngược trực tiếp trên badge và message
    for (let sec = intervalSeconds; sec > 0; sec--) {
      if (!activeBrowsers.has(session) || session.browser?.isClosed?.()) {
        return; // Phiên đã bị đóng bởi người dùng
      }
      const attemptLabel = maxAttempts > 1 ? `lần ${attempt}/${maxAttempts}: ` : '';
      session.leadCheckMessage = `Đang chờ có lead ${attemptLabel}còn ${sec}s...`;
      updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⏳ Chờ lead ${attemptLabel}còn ${sec}s...</span>`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (!activeBrowsers.has(session) || session.browser?.isClosed?.()) {
      return; // Phiên đã bị đóng bởi người dùng
    }

    try {
      console.log(`[LeadCheck] ${label}: Gọi API kiểm tra lead lần ${attempt}/${maxAttempts}...`);
      session.leadCheckMessage = `Đang gọi API kiểm tra lead lần ${attempt}/${maxAttempts} (IP: ${exitIp})...`;

      const leadData = await fetchLeadDatas(leadConfig);
      const isPresent = isLeadPresent(leadData, targetIps);

      if (isPresent) {
        leadFound = true;
        hasApiError = false;
        console.log(`[LeadCheck] ${label}: ✅ Tìm thấy lead cho IP ${exitIp} ở lần ${attempt}! Tiếp tục làm tiếp.`);
        break;
      } else {
        hasApiError = false;
        console.log(`[LeadCheck] ${label}: ⚠️ Chưa thấy IP ${exitIp} trong dữ liệu lead (lần ${attempt}/${maxAttempts}).`);
      }
    } catch (err) {
      hasApiError = true;
      lastApiErrorMessage = err.message.split('\n')[0];
      console.error(`[LeadCheck] ${label}: ⚠️ Lỗi khi gọi API kiểm tra lead: ${lastApiErrorMessage}`);
      session.leadCheckMessage = `⚠️ Lỗi API toffers.top: ${lastApiErrorMessage}`;
      updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#dc2626;">⚠️ Lỗi API (${err.code || 'ERR'})</span>`);
    }
  }

  if (leadFound) {
    session.leadCheckStatus = 'confirmed';
    session.screen5LeadVerified = true;
    const currentScreen = Math.max(session.screenReached || 1, session.currentScreen || 1, (session.completedScreens || 0) + 1);
    const jumpCount = Math.max(session.pageJumps || 0, session.completedScreens || 0, 1);

    // Ghi nhận và lưu lại tiến trình số màn và số lần nhảy trang của IP có lead:
    saveAndRecordLeadIpStats({
      ip: exitIp,
      screen: currentScreen,
      completedScreens: session.completedScreens || 0,
      jumpCount: jumpCount,
      offerNumber: session.offerNumber ?? session.streamRole ?? 1,
      proxy: session.proxyServer || session.proxyKey || '',
      websiteUrl: session.websiteUrl || '',
      confirmedAt: new Date().toISOString(),
      leadAttempt: attempt,
    });

    session.leadCheckMessage = `✅ Đã có lead về cho IP ${exitIp}! Đã làm đến Màn ${currentScreen}, đã nhảy trang ${jumpCount} lần. Đang tiếp tục tự điền các bước tiếp theo...`;
    updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#22c55e;">✅ Có lead (Màn ${currentScreen}, nhảy ${jumpCount})</span>`);

    void tgNotify(`🎉 <b>CÓ LEAD!</b>\n🌐 IP: <code>${exitIp}</code>\n📄 Đã làm đến: <b>Màn ${currentScreen}</b>\n🔀 Đã nhảy trang: <b>${jumpCount} lần</b>\n🏷️ Offer: ${session.offerNumber ?? 1}`);

    // Nếu đang bật chế độ ẩn chờ lead: hiển thị trình duyệt lên màn hình ngay khi có lead
    await session.showWindow?.(true);

    const logs = browserSessionLogs.get(session);
    if (logs) {
      const targetScreen = session.completedScreens || leadConfig.checkScreen || 4;
      logs.push({
        time: new Date().toISOString(),
        offer: session.offerNumber ?? session.streamRole ?? 1,
        type: 'lead_confirmed',
        ip: exitIp,
        detail: `Đã xác nhận có lead trên toffers.top ở lần kiểm tra thứ ${attempt} (Màn ${targetScreen}). Đã làm đến Màn ${currentScreen}, đã nhảy trang ${jumpCount} lần.`,
      });
      queueSaveBrowserLogs();
    }

    // Kích hoạt ngay lượt quét autofill tiếp theo để tiếp tục Jump Page / Rewards / Offerwall
    try {
      session.triggerAutofillScan?.();
    } catch {}
  } else {
    // KHÔNG CÓ LEAD VỀ HOẶC API LỖI: TỰ ĐỘNG TẮT TRÌNH DUYỆT ĐỂ ĐỔI SOCK MỚI
    session.leadCheckStatus = 'failed';
    session.screen5LeadVerified = false;
    session.closingDueToNoLead = true;
    const reasonText = hasApiError
      ? `Lỗi gọi API toffers.top (${lastApiErrorMessage})`
      : `Không có lead về cho IP ${exitIp} sau ${intervalSeconds}s kiểm tra`;
    session.leadCheckMessage = `❌ ${reasonText}. Tự động tắt trình duyệt để đổi sock mới...`;
    updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#ef4444;">❌ Không có lead. Tự tắt Chrome...</span>`);

    console.log(`[LeadCheck] ${label}: ❌ ${reasonText}. Tắt trình duyệt và xoay sock.`);

    const logs = browserSessionLogs.get(session);
    if (logs) {
      logs.push({
        time: new Date().toISOString(),
        offer: session.offerNumber ?? session.streamRole ?? 1,
        type: 'lead_failed',
        ip: exitIp,
        detail: `${reasonText}. Tự động đóng trình duyệt để chuyển proxy tiếp theo.`,
      });
      queueSaveBrowserLogs();
    }

    try {
      if (session.browser && !session.browser.isClosed?.()) {
        session.suppressAutoRefill = false;
        await session.browser.close().catch(() => {});
      }
    } catch (closeErr) {
      console.warn(`[LeadCheck] ${label}: Lỗi khi đóng trình duyệt:`, closeErr.message);
    }
  }
  } catch (fatalLeadErr) {
    console.error(`[LeadCheck] ${label}: Lỗi nghiêm trọng khi kiểm tra lead:`, fatalLeadErr.message);
  }
}


/**
 * Mở một cửa sổ Google Chrome thường, xác minh IP và trang đích trong sổ proxy chung.
 *
 * Múi giờ lấy từ ipinfo qua proxy; IP dùng cho lịch sử được xác minh trong trình duyệt.
 * Mọi lỗi trước khi tải đúng trang đích đều đóng cửa sổ.
 *
 * @param {{build: object, proxy: object, proxyKey: string, websiteUrl: string, usedExitIps: Set<string>, onExitIp: (ip: string) => Promise<void>, tile: object, tileIndex: number, autofillRecords: object[]}} options Binary, proxy, dữ liệu tự điền và vị trí.
 * @return {Promise<{exitIp: string, finalUrl: string, session: object}>} IP, URL và phiên mở thành công.
 * @throws {IpVerificationError|Error} Khi IP, proxy hoặc website không hợp lệ.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
async function openBrowserWithInstalledChrome({
  build, proxy, proxyKey, websiteUrl, usedExitIps, onExitIp, tile, tileIndex, autofillRecords, autoSubmit = true, leadConfig = {}, deviceProfile = 'windows', streamRole = 1, streamLabel = '', offerNumber = 1,
  scriptSteps = null, captchaApiKey = '', completeText = '', timeLimit = 0, delayStop = 0, scriptPath = '',
  antiFingerprint = {}, checkDuplicate = true, hideUntilTarget = false, hideUntilLead = false,
}) {
  const userDataDirectory = join(chromeProfileDirectory, build.channel, build.version, proxyKey);
  const templateSkipReason = await seedChromeProfileFromTemplate(userDataDirectory, build);
  const extensionNames = await listProfileExtensionNames(userDataDirectory);
  await mkdir(userDataDirectory, { recursive: true, mode: 0o700 });

  let timezoneId;
  let ipCountry;
  let ipLat = 0, ipLng = 0;
  try {
    // Thử lại một lần: thiếu thông tin IP thì múi giờ/ngôn ngữ rơi về của máy thật, lệch với IP proxy.
    const ipInfo = await requestProxyIpInfo(proxy).catch(() => requestProxyIpInfo(proxy));
    if (typeof ipInfo.timezone === 'string' && ipInfo.timezone.includes('/')) timezoneId = ipInfo.timezone;
    if (typeof ipInfo.country === 'string') ipCountry = ipInfo.country;
    if (typeof ipInfo.loc === 'string') {
      const parts = ipInfo.loc.split(',').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) [ipLat, ipLng] = parts;
    }
  } catch {
    // Không tra được múi giờ không chặn việc xác minh IP trong trình duyệt.
  }

  const relay = proxy.server.startsWith('socks5://') && proxy.username
    ? await startAuthenticatedSocksRelay(proxy)
    : null;
  // Mỗi phiên một seed: từ đó bốc ra một máy cụ thể (chip/GPU, nhân CPU, màn hình, bản OS) và nhiễu canvas/audio riêng.
  const sessionSeed = Math.floor(Math.random() * 0x7fffffff) || 1;
  const tileViewport = { width: tile.width, height: Math.max(600, tile.height - 85) };
  const profileKey = DEVICE_PROFILES[deviceProfile] ? deviceProfile : 'windows';
  const dp = createDeviceVariant(profileKey, DEVICE_PROFILES[profileKey], sessionSeed, { width: tileViewport.width, height: tileViewport.height + 90 });
  // Ngôn ngữ khớp quốc gia của IP, cùng nguồn với múi giờ.
  const { locale, languages } = localeForCountry(ipCountry);
  const geolocation = antiFingerprint.apiFakeIP && (ipLat || ipLng)
    ? { latitude: ipLat, longitude: ipLng, accuracy: 20 + Math.floor(Math.random() * 60) }
    : null;
  let context;
  let verifiedExitIp = null;
  // Chạy ẩn hoàn toàn — người dùng xem qua Screen View trong giao diện AutoLead
  const headlessViewport = dp.viewport ?? tileViewport;
  try {
    context = await chromium.launchPersistentContext(userDataDirectory, {
      executablePath: build.executablePath,
      ignoreDefaultArgs: ['--disable-extensions', '--disable-background-networking', '--disable-component-update'],
      headless: true,
      viewport: headlessViewport,
      ...(dp.screen && { screen: { width: dp.screen.width, height: dp.screen.height } }),
      ignoreHTTPSErrors: true,
      userAgent: dp.ua(build.version),
      locale,
      isMobile: dp.isMobile,
      hasTouch: dp.hasTouch,
      deviceScaleFactor: dp.deviceScaleFactor ?? 1,
      proxy: relay?.proxy ?? toPlaywrightProxy(proxy),
      ...(timezoneId && { timezoneId }),
      // Toạ độ theo IP proxy qua API của Playwright: quyền geolocation và vị trí trả về khớp nhau.
      ...(geolocation && { geolocation, permissions: ['geolocation'] }),
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
        // WebRTC chỉ đi qua proxy: không để STUN/UDP làm lộ IP thật của máy.
        '--webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--disable-gpu',
        // Chrome mới không tự dùng SwiftShader cho WebGL nữa; thiếu cờ này trang thấy "không có WebGL".
        '--enable-unsafe-swiftshader',
        '--disable-dev-shm-usage',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-ipc-flooding-protection',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--js-flags=--max-old-space-size=512',
        '--disk-cache-size=1',
        '--media-cache-size=1',
        '--renderer-process-limit=3',
      ],
    });
  } catch (error) {
    await relay?.close();
    throw error;
  }
  const actualOfferNumber = Number(offerNumber) || Number(streamRole) || 1;
  const session = {
    browser: context,
    tileIndex,
    slot: (tileIndex ?? 0) + 1,
    chromeVersion: build.version,
    deviceProfile,
    deviceSummary: dp.summary,
    suppressAutoRefill: false,
    proxyKey,
    proxyServer: proxy.server,
    websiteUrl,
    streamRole,
    streamLabel: streamLabel || `Offer ${actualOfferNumber}`,
    offerNumber: actualOfferNumber,
    hideUntilTarget: Boolean(hideUntilTarget),
    hideUntilLead: Boolean(hideUntilLead),
    hasShownWindow: false,
    leadCheckStatus: null,
    leadCheckMessage: null,
    extensions: extensionNames.length > 0
      ? extensionNames.join(', ')
      : `không có (${templateSkipReason ?? 'profile mẫu chưa cài extension nào'})`,
    // Trạng thái hiển thị trong giao diện AutoLead (leadCheckMessage), không ghi vào trang đích.
    updateBadge: (text) => { session.badgeText = text; },
    addLog: (entry) => {
      if (typeof session.addBrowserLog === 'function') {
        session.addBrowserLog(entry);
      } else {
        const logs = browserSessionLogs.get(session);
        if (logs) logs.push({ time: new Date().toISOString(), offer: session.offerNumber, ...entry });
      }
    },
  };
  const assignedEmail = dequeueNextEmail();
  if (assignedEmail) {
    session.assignedEmail = assignedEmail;
  }
  attachBrowserLogger(context, session);

  // Giả lập thiết bị + chống fingerprint: một script duy nhất chạy trong mọi frame, hàm vá trông như native.
  const stealthConfig = buildStealthConfig(dp, antiFingerprint, sessionSeed);
  await context.addInitScript(stealthInitScript, stealthConfig);
  // UA, Client Hints, navigator.platform, số nhân CPU, ngôn ngữ: đổi tận gốc qua CDP cho từng tab và iframe khác site.
  const nativeOverrides = {
    userAgentOverride: buildUserAgentOverride(dp, build, languages),
    hardwareConcurrency: dp.spoof.hardwareConcurrency,
  };
  const overrideTasks = new WeakMap();
  const applyDeviceOverrides = (targetPage) => {
    if (!overrideTasks.has(targetPage)) {
      overrideTasks.set(targetPage, applyNativeOverrides(context, targetPage, nativeOverrides)
        .catch((error) => console.warn(`[Stealth] Không áp được override cho tab: ${error.message}`)));
    }
    return overrideTasks.get(targetPage);
  };
  context.on('page', (newPage) => { void applyDeviceOverrides(newPage); });
  await Promise.all(context.pages().map(applyDeviceOverrides));

  // Lấy từ queue available (đã kiểm tra ở launchRequestedBrowsers)
  const recordPool = autofillQueue.available.length > 0 ? autofillQueue.available : autofillRecords;
  attachAutofill(context, recordPool, new URL(websiteUrl).origin, session, {
    autoSubmit,
    enableLeadCheck: leadConfig.enabled !== false,
    leadCheckScreen: leadConfig.checkScreen || 4,
    onLog: (entry) => {
      if (entry && (entry.type === 'field_filled' || entry.type === 'submit_clicked' || entry.type === 'lead_confirmed' || entry.type === 'ai_action')) {
        if (!session.hideUntilLead || entry.type === 'lead_confirmed') {
          void session.showWindow?.(entry.type === 'lead_confirmed');
        }
      }
      session.addBrowserLog?.(entry);
    },
    onRecordPicked: (record) => {
      if (!session.hideUntilLead) {
        void session.showWindow?.();
      }
      if (session.assignedEmail && record) {
        record.email = session.assignedEmail;
        record.emailaddress = session.assignedEmail;
        record.mail = session.assignedEmail;
        record.assignedEmail = session.assignedEmail;
      }
      session.currentRecord = record; // lưu để AI assist dùng khi cần
      // Dequeue ngay khi chọn
      const idx = autofillQueue.available.findIndex((r) => r === record || autofillRecordKey(r) === autofillRecordKey(record));
      if (idx !== -1) {
        autofillQueue.available.splice(idx, 1);
        autofillQueue.used.push(record);
        void saveAutofillQueue();
      }
      void markAutofillRecordUsed(record);
    },
    onScreen5Reached: (sess, page) => {
      void startLeadVerification(sess, leadConfig);
    },
    onEmailSubmitted: (sess, page) => {
      void startLeadVerification(sess, leadConfig);
    },
    onScreenAdvanced: (sess, screen, jumps) => {
      if (sess.leadCheckStatus === 'confirmed' && sess.exitIp) {
        saveAndRecordLeadIpStats({
          ip: sess.exitIp,
          screen,
          completedScreens: sess.completedScreens,
          jumpCount: jumps,
          offerNumber: sess.offerNumber ?? sess.streamRole ?? 1,
          proxy: sess.proxyServer || sess.proxyKey,
          websiteUrl: sess.websiteUrl,
        });
      }
    },
    onPageJump: (sess, jumps, url) => {
      if (sess.leadCheckStatus === 'confirmed' && sess.exitIp) {
        saveAndRecordLeadIpStats({
          ip: sess.exitIp,
          screen: Math.max(sess.screenReached || 1, sess.currentScreen || 1, (sess.completedScreens || 0) + 1),
          completedScreens: sess.completedScreens || 0,
          jumpCount: jumps,
          offerNumber: sess.offerNumber ?? sess.streamRole ?? 1,
          proxy: sess.proxyServer || sess.proxyKey,
          websiteUrl: sess.websiteUrl,
        });
      }
    },
    onStuck: (page) => {
      // Chỉ chạy AI Assist cho tab chính đang active, không chạy trên tab phụ/ad/trang blog
      if (session.mainPage && page !== session.mainPage) return;
      if (session.aiAssistRunning) return;

      const currentUrl = page.url?.() || '';
      if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.includes('api.ipify.org') || currentUrl.includes('toffers.top/click')) {
        return;
      }
      const now = Date.now();
      // Chống spam AI: Nếu cùng 1 URL vừa chạy AI trong vòng 4s thì không chạy lại dồn dập
      if (session.lastAiUrl === currentUrl && (now - (session.lastAiTime || 0) < 4000)) {
        return;
      }
      session.lastAiUrl = currentUrl;
      session.lastAiTime = now;

      const currentRecord = session.currentRecord || (recordPool[session.recordIndex] ?? recordPool[0]);
      if (session.assignedEmail && currentRecord) {
        currentRecord.email = session.assignedEmail;
        currentRecord.emailaddress = session.assignedEmail;
        currentRecord.mail = session.assignedEmail;
        currentRecord.assignedEmail = session.assignedEmail;
      }
      void runAiAssist(page, currentRecord, session, {
        onLog: (entry) => session.addLog?.(entry),
      }).then(async () => {
        // AI xong → kích autofill quét lại một lần
        session.triggerAutofillScan?.();
        // Chờ ngắn 600ms để trang ổn định
        await new Promise((r) => setTimeout(r, 600));
        if (page.isClosed()) return;
        const stillHasWork = await pageHasWork(page);

        // CHỈ ĐÓNG TRÌNH DUYỆT KHI ĐÃ ĐẠT TRANG HOÀN TẤT (Thank You / Confirmation)
        const isThankYouPage = await page.evaluate(() => {
          const text = (document.body?.innerText || '').toLowerCase();
          const url = (window.location.href || '').toLowerCase();
          const hasThankYouText = /thank\s*you|congratulations|confirmed|your\s*submission|application\s*received|cảm ơn/i.test(text);
          const hasThankYouUrl = /thank[-_]?you|confirmation|success|completed|receipt/i.test(url);
          return hasThankYouText || hasThankYouUrl;
        }).catch(() => false);

        if (!stillHasWork && isThankYouPage && (session.autofillFields ?? 0) > 0) {
          console.log(`[AI-Assist] Slot ${tileIndex + 1}: đã đạt trang cảm ơn (${session.autofillFields} trường), đóng trình duyệt và mở phiên mới.`);
          session.addLog?.({
            time: new Date().toISOString(),
            type: 'ai_completed',
            detail: `AI Assist đã hoàn tất đến trang cảm ơn (${session.autofillFields} trường). Đóng trình duyệt và mở phiên mới.`,
          });
          session.suppressAutoRefill = false;
          await session.browser?.close?.().catch(() => {});
        } else if (!stillHasWork && !isThankYouPage) {
          console.log(`[AI-Assist] Slot ${tileIndex + 1}: chưa đạt trang cảm ơn, tiếp tục giữ trình duyệt để người dùng theo dõi hoặc trang tải tiếp.`);
        }
      });
    },
  });
  activeBrowsers.add(session);

  // Nếu stop được bấm trong lúc browser đang khởi động → đóng ngay
  if (autoRefill.stopRequested) {
    session.suppressAutoRefill = true;
    session.isClosed = true;
    await context.close().catch(() => {});
    return null;
  }

  context.on('close', () => {
    if (session.leadCheckStatus === 'confirmed' && session.exitIp) {
      saveAndRecordLeadIpStats({
        ip: session.exitIp,
        screen: Math.max(session.screenReached || 1, session.currentScreen || 1, (session.completedScreens || 0) + 1),
        completedScreens: session.completedScreens || 0,
        jumpCount: Math.max(session.pageJumps || 0, session.completedScreens || 0),
        offerNumber: session.offerNumber ?? session.streamRole ?? 1,
        proxy: session.proxyServer || session.proxyKey,
        websiteUrl: session.websiteUrl,
      });
    }
    activeBrowsers.delete(session);
    releaseProxyLock(proxy, session.exitIp);
    void relay?.close();
    const _slot = session.slot ?? tileIndex + 1;
    const _sc = screencastSessions.get(_slot);
    if (_sc) {
      if (_sc.keepaliveTimer) { clearInterval(_sc.keepaliveTimer); _sc.keepaliveTimer = null; }
      _sc.cdpClient.detach().catch(() => {});
      try { _sc.sseResponse.end(); } catch {}
      screencastSessions.delete(_slot);
    }
    // Profile dùng xong là xoá cả profile và cache: không giữ lại ~179 MB mỗi proxy đã thử.
    void removeChromeSessionProfile(userDataDirectory);
    chromeBuildRotationCounter += 1;
    if (!session.suppressAutoRefill && !autoRefill.stopRequested && autoRefill.enabled) {
      if (!session.closingDueToTrafficBlocked) {
        autoRefill.message = `Slot ${tileIndex + 1} (${streamLabel || 'Trình duyệt'}) trống; đang tìm proxy thay thế.`;
      }
      // 5s delay khi chạy tuần tự hoặc khi không có lead; delayStop cộng thêm theo cấu hình script exe
      const baseDelay = (autoRefill.sequential || session.closingDueToNoLead) ? 5000 : 0;
      queueAutomaticRefill(baseDelay + delayStop * 1000);
    }
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    // Có giới hạn thời gian: một lệnh CDP không trả lời không được làm phiên kẹt trước bước xác minh IP.
    await Promise.race([applyDeviceOverrides(page), new Promise((resolve) => setTimeout(resolve, 5000))]);
    let cdpSession = null;
    let cdpWindowId = null;

    if (hideUntilTarget || hideUntilLead) {
      try {
        cdpSession = await context.newCDPSession(page);
        const win = await cdpSession.send('Browser.getWindowForTarget');
        cdpWindowId = win.windowId;
        await cdpSession.send('Browser.setWindowBounds', {
          windowId: cdpWindowId,
          bounds: { windowState: 'minimized' },
        });
        const modeText = hideUntilLead ? 'chỉ hiện khi có lead' : 'chỉ hiện khi vào trang đích';
        console.log(`[HideBrowser] Slot ${tileIndex + 1}: Chạy ngầm (ẩn cửa sổ), ${modeText}.`);
        session.addBrowserLog?.({ type: 'navigate', detail: `Chạy ngầm (ẩn cửa sổ), ${modeText}...` });
      } catch (err) {
        console.warn('[HideBrowser] Lỗi ẩn cửa sổ ban đầu:', err.message);
      }
    }

    session.showWindow = async (force = false) => {
      if ((!hideUntilTarget && !hideUntilLead) || session.hasShownWindow) return;
      if (hideUntilLead && !force) return;
      session.hasShownWindow = true;
      try {
        const activePage = session.mainPage || page;
        if (!cdpSession && !activePage.isClosed()) {
          cdpSession = await context.newCDPSession(activePage);
        }
        if (cdpSession) {
          if (!cdpWindowId) {
            const win = await cdpSession.send('Browser.getWindowForTarget');
            cdpWindowId = win.windowId;
          }
          const targetWidth = dp.viewport ? dp.viewport.width : tile.width;
          const targetHeight = dp.viewport ? (dp.viewport.height + 100) : tile.height;
          await cdpSession.send('Browser.setWindowBounds', {
            windowId: cdpWindowId,
            bounds: {
              left: tile.left,
              top: tile.top,
              width: targetWidth,
              height: targetHeight,
              windowState: 'normal',
            },
          });
          if (!activePage.isClosed()) await activePage.bringToFront().catch(() => {});
          const reasonText = hideUntilLead ? 'Đã có lead thành công' : 'Đã vào trang đích an toàn';
          console.log(`[ShowWindow] Slot ${tileIndex + 1}: ${reasonText}, hiển thị trình duyệt.`);
          session.addBrowserLog?.({ type: 'navigate', detail: `${reasonText}, hiển thị cửa sổ trình duyệt.` });
        }
      } catch (err) {
        console.warn('[ShowWindow] Lỗi hiển thị cửa sổ:', err.message);
      }
    };

    const exitIp = await verifyBrowserExitIp(context, usedExitIps, onExitIp, websiteUrl, checkDuplicate);
    verifiedExitIp = exitIp;
    session.exitIp = exitIp;
    session.streamRole = streamRole;
    session.streamLabel = streamLabel;
    session.websiteUrl = websiteUrl;
    const response = await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    const finalUrl = page.url();
    if (!response || response.status() >= 400) {
      throw new Error(`website trả HTTP ${response?.status() ?? 'không có phản hồi'}`);
    }
    const deadReason = await getDeadOrBlockedReason(page);
    if (deadReason) {
      throw new Error(`trang đích hiển thị ${deadReason}`);
    }
    session.mainPage = page; // dùng để phân biệt tab chính vs tab phụ
    if (!hideUntilLead) {
      await session.showWindow();
    }
    await page.bringToFront().catch(() => {});

    // IP, thiết bị và luồng hiển thị trong giao diện AutoLead; không chèn badge hay sửa tiêu đề trang đích vì script chống bot đọc được.
    context.on('page', (newPage) => {
      // Guard cho tab phụ: load quá 15s không xong → đóng tab, quay về tab chính
      const slowLoadTimer = setTimeout(async () => {
        if (newPage.isClosed() || newPage === session.mainPage) return;
        try {
          const readyState = await newPage.evaluate(() => document.readyState).catch(() => 'complete');
          if (readyState !== 'complete') {
            console.log(`[SlowLoad] Tab phụ load quá 15s (${newPage.url()}), đóng và quay về tab chính.`);
            session.addBrowserLog?.({ type: 'navigate', url: newPage.url(), title: '[Đóng - load quá 15s]', html: '' });
            await newPage.close().catch(() => {});
            const remaining = context.pages().filter((p) => !p.isClosed());
            if (remaining.length > 0) await (session.mainPage?.isClosed?.() ? remaining[0] : session.mainPage).bringToFront().catch(() => {});
          }
        } catch {}
      }, 15000);
      newPage.once('load', () => clearTimeout(slowLoadTimer));
      newPage.once('close', () => clearTimeout(slowLoadTimer));

      // Guard tab phụ bị lỗi mạng → đóng tab đó thôi, không đóng cả browser
      newPage.on('load', async () => {
        if (newPage.isClosed() || newPage === session.mainPage) return;
        try {
          const deadReason = await getDeadOrBlockedReason(newPage);
          if (!deadReason) return;
          console.log(`[DeadTab] Tab phụ lỗi "${deadReason}" (${newPage.url()}), đóng và quay về tab chính.`);
          session.addBrowserLog?.({ type: 'traffic_blocked', detail: `Tab phụ lỗi: ${deadReason}` });
          await newPage.close().catch(() => {});
          const remaining = context.pages().filter((p) => !p.isClosed());
          if (remaining.length > 0) await (session.mainPage?.isClosed?.() ? remaining[0] : session.mainPage).bringToFront().catch(() => {});
        } catch {}
      });
    });

    closeChromeWhenLastTabCloses(session);
    watchTrafficBlockedPage(session);

    // completeText: đóng Chrome + tăng bộ đếm limitRun khi phát hiện chuỗi hoàn tất trong nội dung trang
    if (completeText) {
      const needle = completeText.toLowerCase();
      const completeTimer = setInterval(async () => {
        if (page.isClosed()) { clearInterval(completeTimer); return; }
        const found = await page.evaluate((n) => (document.body?.innerText || '').toLowerCase().includes(n), needle).catch(() => false);
        if (found) {
          clearInterval(completeTimer);
          limitRunCount += 1;
          session.addLog?.({ time: new Date().toISOString(), type: 'complete_text', detail: `Đã tìm thấy text hoàn tất "${completeText}" (${limitRunCount}${limitRunMax > 0 ? '/' + limitRunMax : ''}).` });
          session.suppressAutoRefill = false;
          await session.browser?.close?.().catch(() => {});
        }
      }, 2000);
      context.on('close', () => clearInterval(completeTimer));
    }

    // timeLimit: đóng phiên sau N giây bất kể đang ở trạng thái nào
    if (timeLimit > 0) {
      const timeLimitTimer = setTimeout(async () => {
        session.addLog?.({ time: new Date().toISOString(), type: 'time_limit', detail: `Hết timeout phiên (${timeLimit}s), đóng trình duyệt.` });
        await session.browser?.close?.().catch(() => {});
      }, timeLimit * 1000);
      context.on('close', () => clearTimeout(timeLimitTimer));
    }

    // Chạy script lệnh exe (SendByName/ClickXpath/ByPassReCaptcha/...) thay cho autofill tự động nếu có cấu hình
    if (scriptSteps?.length > 0) {
      void (async () => {
        await page.waitForLoadState('domcontentloaded', { timeout: navigationTimeout }).catch(() => {});
        const record = session.currentRecord ?? autofillRecords[0] ?? {};
        await runScript(page, scriptSteps, record, {
          captchaApiKey,
          scriptDir: scriptPath ? dirname(scriptPath) : '',
          logger: (entry) => session.addLog?.({ time: new Date().toISOString(), ...entry }),
        });
      })();
    }

    return { exitIp, finalUrl, session };
  } catch (error) {
    session.suppressAutoRefill = true;
    session.isClosed = true;
    activeBrowsers.delete(session);
    releaseProxyLock(proxy, session.exitIp || verifiedExitIp);
    try {
      await Promise.race([
        context.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), 2000)),
      ]);
    } catch {}
    // QUAN TRỌNG: Force kill ngay tiến trình Chrome của profile này để cửa sổ đóng lập tức 100%, không bị kẹt trên màn hình
    await executeFile('pkill', ['-9', '-f', `user-data-dir.*${proxyKey}`]).catch(() => {});
    await relay?.close().catch(() => {});
    void removeChromeSessionProfile(userDataDirectory);
    throw error;
  }
}

/**
 * Kết thúc phiên Chrome khi người dùng đóng tab cuối cùng bằng dấu X.
 *
 * @param {object} session Phiên Chrome cần theo dõi các tab.
 * @return {void} Đăng ký sự kiện đóng tab cho phiên.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
function closeChromeWhenLastTabCloses(session) {
  const watchedPages = new WeakSet();

  /**
   * Đóng tiến trình Chrome khi không còn tab nào và giữ slot ở trạng thái đã đóng.
   *
   * @return {void} Yêu cầu đóng phiên nếu tab cuối đã biến mất.
   * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
   * @since 2026-10-15
   */
  function closeEmptyChromeSession() {
    if (session.suppressAutoRefill || session.closingDueToTrafficBlocked || session.closingDueToNoLead || session.leadCheckStatus === 'failed') return;
    for (const page of session.browser.pages()) {
      if (!page.isClosed()) return;
    }
    if (!autoRefill.sequential) {
      // Chế độ thường: user tự đóng tab → giảm target, không mở lại
      session.suppressAutoRefill = true;
      autoRefill.targetCount = Math.max(0, Math.min(autoRefill.targetCount, activeBrowsers.size - 1));
    }
    autoRefill.message = `Đã đóng Chrome ${session.chromeVersion} sau khi tab cuối cùng được đóng.`;
    void session.browser.close().catch(() => {});
  }

  /**
   * Theo dõi tab mới để cả tab mở sau cũng được tính khi đóng phiên.
   *
   * @param {object} page Tab Chrome vừa được mở.
   * @return {void} Gắn sự kiện đóng cho tab chưa theo dõi.
   * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
   * @since 2026-10-15
   */
  function watchTab(page) {
    if (watchedPages.has(page)) return;
    watchedPages.add(page);
    page.on('close', closeEmptyChromeSession);
  }

  session.browser.on('page', watchTab);
  for (const page of session.browser.pages()) watchTab(page);
}

/**
 * Gắn logger hành động vào context Chrome: ghi nhận mọi điều hướng và click.
 * Tự động chụp và lưu trọn vẹn mã nguồn HTML của các trang ra file trên đĩa bền bỉ.
 *
 * @param {object} context Playwright BrowserContext.
 * @param {object} session Phiên Chrome hiện tại.
 */
function attachBrowserLogger(context, session) {
  const sessionId = randomUUID();
  const sessionItem = {
    id: sessionId,
    slot: session.tileIndex + 1,
    offer: session.offerNumber ?? session.streamRole ?? 1,
    offerUrl: session.websiteUrl ?? '',
    ip: session.exitIp ?? '?',
    version: session.chromeVersion ?? 'stable',
    startedAt: new Date().toISOString(),
    logs: [],
  };

  persistedBrowserLogs.unshift(sessionItem);
  if (persistedBrowserLogs.length > 150) {
    persistedBrowserLogs.pop();
  }

  browserSessionLogs.set(session, sessionItem.logs);

  function addLog(entry) {
    sessionItem.ip = session.exitIp ?? sessionItem.ip;
    if (session.offerNumber) sessionItem.offer = session.offerNumber;
    if (session.websiteUrl) sessionItem.offerUrl = session.websiteUrl;
    const logItem = {
      time: new Date().toISOString(),
      offer: session.offerNumber ?? session.streamRole ?? 1,
      ...entry,
    };
    sessionItem.logs.push(logItem);
    if (sessionItem.logs.length > 200) sessionItem.logs.shift();
    queueSaveBrowserLogs();
  }
  session.addBrowserLog = addLog;
  session.addLog = addLog;
  session.logs = sessionItem.logs;

  // Click tay được ghi ở bộ điều khiển Screen View; không tiêm listener hay hàm toàn cục vào trang.

  // Ghi nhận điều hướng + lưu đầy đủ 100% HTML ra file đĩa riêng biệt
  function hookPage(page) {
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return;
      const url = frame.url();
      if (!url || url === 'about:blank' || url.startsWith('chrome:')) return;
      let html = '';
      let title = '';
      let htmlFilename = '';
      let htmlPath = '';

      try {
        html = await page.content();
      } catch {}
      try {
        title = await page.title();
      } catch {}

      if (html) {
        try {
          const offerNum = session.offerNumber ?? session.streamRole ?? 1;
          const offerSubDir = join(interactionHtmlDirectory, `offer-${offerNum}`);
          await mkdir(offerSubDir, { recursive: true });
          // Xóa file cũ nhất nếu vượt 300 file trong thư mục offer này
          try {
            const existing = (await readdir(offerSubDir)).filter((f) => f.endsWith('.html'));
            if (existing.length >= 300) {
              existing.sort();
              for (const old of existing.slice(0, existing.length - 299)) {
                await unlink(join(offerSubDir, old)).catch(() => {});
              }
            }
          } catch {}
          const safeHost = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_') || 'page';
          const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const randSuffix = Math.random().toString(36).slice(2, 6);
          htmlFilename = `offer${offerNum}_${nowStr}_slot${session.tileIndex + 1}_${safeHost}_${randSuffix}.html`;
          htmlPath = join(offerSubDir, htmlFilename);
          await writeFile(htmlPath, html, 'utf8');
        } catch (err) {
          console.error('Lỗi khi ghi file HTML:', err.message);
        }
      }

      addLog({
        type: 'navigate',
        url,
        title,
        // Không nhúng HTML vào JSON để tránh phình file — dùng htmlPath để load khi cần
        htmlPath: htmlPath || null,
        htmlFilename: htmlFilename || null,
      });
    });
  }

  context.on('page', hookPage);
  for (const page of context.pages()) hookPage(page);

  context.on('close', () => {
    queueSaveBrowserLogs();
  });
}

/**
 * Kiểm tra xem trang có hiển thị thông báo "Traffic Blocked!" hay không.
 *
 * @param {object} page Tab của Playwright hoặc Puppeteer.
 * @return {Promise<boolean>} True nếu phát hiện "Traffic Blocked!", ngược lại false.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export async function getDeadOrBlockedReason(page) {
  try {
    if (!page || (typeof page.isClosed === 'function' && page.isClosed())) return null;
    const currentUrl = typeof page.url === 'function' ? page.url() : (page.url || '');
    if (typeof currentUrl === 'string' && (currentUrl.startsWith('chrome-error://') || currentUrl.startsWith('about:neterror'))) {
      return 'Lỗi mạng trình duyệt (chrome-error)';
    }

    const checkFrame = async (frame) => {
      try {
        if (!frame) return null;
        const frameUrl = typeof frame.url === 'function' ? frame.url() : (frame.url || '');
        if (typeof frameUrl === 'string' && (frameUrl.startsWith('chrome-error://') || frameUrl.startsWith('about:neterror'))) {
          let frameErr = '';
          try {
            frameErr = typeof frame.evaluate === 'function' ? await frame.evaluate(() => {
              const el = document.getElementById('sub-frame-error-details') || document.getElementById('main-frame-error-details') || document.getElementById('sub-frame-error') || document.getElementById('main-frame-error');
              return el ? (el.innerText || el.textContent || '').trim() : '';
            }) : '';
          } catch {}
          return frameErr ? `Lỗi kết nối (${frameErr})` : 'Lỗi mạng trình duyệt (chrome-error)';
        }

        if (typeof frame.evaluate !== 'function') return null;

        const evaluatePromise = frame.evaluate(() => {
          // 1. Kiểm tra phần tử sub-frame-error hoặc main-frame-error chuẩn của Chromium
          const subFrameError = (typeof document !== 'undefined') && (document.getElementById('sub-frame-error') || document.getElementById('main-frame-error') || document.querySelector?.('#sub-frame-error, #main-frame-error, #sub-frame-error-details, #main-frame-error-details'));
          if (subFrameError) {
            const details = document.getElementById('sub-frame-error-details') || document.getElementById('main-frame-error-details') || subFrameError;
            const errText = (details.innerText || details.textContent || '').trim();
            return errText ? `ERR_CONNECTION_REFUSED: ${errText}` : 'ERR_CONNECTION_REFUSED';
          }

          const title = (typeof document !== 'undefined' && document.title) || '';
          const bodyText = (typeof document !== 'undefined' && document.body) ? (document.body.innerText || document.body.textContent || '') : '';
          const docText = (typeof document !== 'undefined' && document.documentElement) ? (document.documentElement.innerText || document.documentElement.textContent || '') : '';
          const fullText = `${title} ${bodyText} ${docText}`;

          if (/traffic\s+blocked/i.test(fullText)) {
            return 'Traffic Blocked!';
          }

          if (/^\s*disabled\s*$/i.test(title) && /^\s*disabled\s*$/i.test(bodyText.trim())) {
            return 'Disabled';
          }

          if (/refused to connect|từ chối kết nối|bị từ chối kết nối/i.test(fullText)) {
            return 'ERR_CONNECTION_REFUSED';
          }

          const netErrorMatch = fullText.match(/\b(ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET|ERR_PROXY_CONNECTION_FAILED|ERR_SOCKS_CONNECTION_FAILED|ERR_TUNNEL_CONNECTION_FAILED|ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT|ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_NAME_NOT_RESOLVED|DNS_PROBE_FINISHED_NXDOMAIN|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE|ERR_SSL_PROTOCOL_ERROR|ERR_NETWORK_CHANGED|ERR_BLOCKED_BY_CLIENT|ERR_FAILED)\b/i);
          if (netErrorMatch) {
            return netErrorMatch[1].toUpperCase();
          }

          if (/this site can[’']t be reached|không thể truy cập trang web này/i.test(fullText)) {
            return 'This site can’t be reached';
          }
          if (/unexpectedly closed the connection|đã bất ngờ đóng kết nối/i.test(fullText)) {
            return 'ERR_CONNECTION_CLOSED';
          }
          if (/checking the proxy and the firewall|kiểm tra proxy và tường lửa/i.test(fullText)) {
            return 'Lỗi kết nối proxy';
          }

          // Kiểm tra xem có bất kỳ iframe con nào trong DOM có sub-frame-error không
          try {
            if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
              const iframes = document.querySelectorAll('iframe');
              for (const ifr of iframes) {
                try {
                  const idoc = ifr.contentDocument || ifr.contentWindow?.document;
                  if (idoc) {
                    const sub = idoc.getElementById('sub-frame-error') || idoc.querySelector?.('#sub-frame-error, #sub-frame-error-details');
                    if (sub) {
                      const txt = (sub.innerText || sub.textContent || '').trim();
                      return txt ? `ERR_CONNECTION_REFUSED: ${txt}` : 'ERR_CONNECTION_REFUSED';
                    }
                    const ifrText = `${idoc.title || ''} ${idoc.body ? idoc.body.innerText || '' : ''}`;
                    if (/refused to connect|từ chối kết nối/i.test(ifrText)) {
                      return 'ERR_CONNECTION_REFUSED';
                    }
                  }
                } catch {}
              }
            }
          } catch {}

          return null;
        });

        const timeoutPromise = new Promise((resolve) => {
          const timeoutId = setTimeout(() => resolve(null), 2000);
          timeoutId.unref?.();
        });

        const result = await Promise.race([evaluatePromise, timeoutPromise]);
        if (typeof result === 'string' && result.trim()) return result.trim();
        if (result === true) return 'Traffic Blocked!';
        return null;
      } catch {
        return null;
      }
    };

    // 1. Kiểm tra trang chính
    let reason = await checkFrame(page);
    if (reason) return reason;

    // 2. Kiểm tra các frame/iframe con
    if (typeof page.frames === 'function') {
      try {
        const frames = page.frames();
        for (const frame of frames) {
          if (frame === page.mainFrame?.()) continue;
          reason = await checkFrame(frame);
          if (reason) return reason;
        }
      } catch {}
    }

    return null;
  } catch {
    return null;
  }
}

export async function hasTrafficBlocked(page) {
  const reason = await getDeadOrBlockedReason(page);
  return Boolean(reason);
}

/**
 * Đóng cửa sổ và tự động mở proxy khác thay thế khi trang hiển thị thông báo "Traffic Blocked!".
 *
 * @param {object} session Phiên Chrome đã mở thành công.
 * @return {void} Gắn lịch kiểm tra vào các tab của phiên.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export function watchTrafficBlockedPage(session) {
  if (!session || session.trafficWatcherAttached) return;
  session.trafficWatcherAttached = true;
  let checking = false;
  let blocked = false;
  const redirectTracker = new WeakMap();

  const timer = setInterval(() => {
    if (checking || blocked) return;
    checking = true;
    void (async () => {
      try {
        if (!session.browser || (typeof session.browser.isClosed === 'function' && session.browser.isClosed())) {
          clearInterval(timer);
          return;
        }

        const pages = typeof session.browser?.pages === 'function'
          ? await session.browser.pages()
          : [];

        for (const page of pages) {
          if (typeof page?.isClosed === 'function' && page.isClosed()) continue;

          // 1. Kiểm tra trang có bị lỗi mạng hoặc thông báo blocked không
          const deadReason = await getDeadOrBlockedReason(page);
          if (deadReason) {
            // Tab phụ bị lỗi → chỉ đóng tab đó, quay về tab chính (không đóng browser)
            if (page !== session.mainPage) {
              console.log(`[DeadTab] Tab phụ bị ${deadReason} (${page.url()}), đóng tab và quay về tab chính.`);
              session.addBrowserLog?.({ type: 'traffic_blocked', detail: `Tab phụ bị ${deadReason}. Đóng tab, giữ trình duyệt.` });
              await page.close().catch(() => {});
              const remaining = (session.browser?.pages ? session.browser.pages() : []).filter((p) => !p.isClosed());
              if (remaining.length > 0) await (session.mainPage?.isClosed?.() ? remaining[0] : session.mainPage).bringToFront().catch(() => {});
              continue;
            }
            // Tab chính bị lỗi → đóng cả browser như cũ
            blocked = true;
            clearInterval(timer);
            session.closingDueToTrafficBlocked = true;
            if (autoRefill.stopRequested || !autoRefill.enabled) {
              session.suppressAutoRefill = true;
              session.isClosed = true;
              activeBrowsers.delete(session);
              await page.close().catch(() => {});
              await session.browser?.close?.().catch(() => {});
              if (session.proxyKey) {
                await executeFile('pkill', ['-9', '-f', `user-data-dir.*${session.proxyKey}`]).catch(() => {});
              }
              return;
            }
            session.suppressAutoRefill = false;

            try {
              if (session.proxyKey) {
                const history = await readProxyUsageHistory();
                if (history?.proxies?.[session.proxyKey]) {
                  history.proxies[session.proxyKey] = {
                    ...history.proxies[session.proxyKey],
                    status: 'failed',
                    reason: deadReason,
                    completedAt: new Date().toISOString(),
                  };
                  await persistProxyUsageHistory(history);
                }
              }
            } catch {
              // Bỏ qua lỗi ghi lịch sử nếu file bận
            }

            const label = session.chromeVersion
              ? `Chrome ${session.chromeVersion}`
              : (session.profileId ? `Profile ${session.profileId}` : `Slot ${(session.tileIndex ?? 0) + 1}`);

            autoRefill.message = `${label} (IP ${session.exitIp ?? 'chưa rõ'}) bị ${deadReason}; `
              + 'đã đóng cửa sổ và đang tự động mở sock khác thay thế…';

            const logs = browserSessionLogs.get(session);
            if (logs) {
              logs.push({
                time: new Date().toISOString(),
                offer: session.offerNumber ?? session.streamRole ?? 1,
                type: 'traffic_blocked',
                detail: `${label} (IP: ${session.exitIp ?? 'chưa rõ'}) bị ${deadReason}. Đóng cửa sổ và đổi sock khác.`,
              });
              queueSaveBrowserLogs();
            }

            session.updateBadge?.(`⚠️ <strong>${deadReason}</strong> Đang đổi sock…`);

            chromeBuildRotationCounter += 1;
            await page.close().catch(() => {});
            await session.browser?.close?.().catch(() => {});
            if (session.proxyKey) {
              await executeFile('pkill', ['-9', '-f', `user-data-dir.*${session.proxyKey}`]).catch(() => {});
            }
            if (!autoRefill.stopRequested && autoRefill.enabled) {
              queueAutomaticRefill();
            }
            return;
          }

          // 2. Kiểm tra nếu web đứng ở adtrapper mãi không nhảy tab
          const currentUrl = typeof page.url === 'function' ? page.url() : '';
          const isAdtrapper = /adtrapper|adswapper/i.test(currentUrl);

          if (isAdtrapper) {
            // Kiểm tra xem đã có tab khác nhảy sang trang offer đích chưa
            const hasOtherOfferTab = pages.some((p) => {
              if (p === page || (typeof p.isClosed === 'function' && p.isClosed())) return false;
              const otherUrl = typeof p.url === 'function' ? p.url() : '';
              return otherUrl && !otherUrl.startsWith('about:') && !/adtrapper|adswapper|toffers\.top/i.test(otherUrl);
            });

            if (!hasOtherOfferTab) {
              let tracker = redirectTracker.get(page);
              if (!tracker) {
                tracker = { firstSeenAt: Date.now(), reloadCount: 0, lastReloadAt: 0, reloading: false };
                redirectTracker.set(page, tracker);
              }

              if (!tracker.reloading) {
                const timeWaiting = Date.now() - (tracker.lastReloadAt || tracker.firstSeenAt);
                // Nếu đứng im ở adtrapper quá 8 giây
                if (timeWaiting >= 8000) {
                  const label = session.chromeVersion
                    ? `Chrome ${session.chromeVersion}`
                    : (session.profileId ? `Profile ${session.profileId}` : `Slot ${(session.tileIndex ?? 0) + 1}`);

                  if (tracker.reloadCount < 2) {
                    tracker.reloadCount += 1;
                    tracker.reloading = true;
                    tracker.lastReloadAt = Date.now();

                    console.log(`[Adtrapper] ${label}: Đứng ở adtrapper quá 8s chưa nhảy tab. Đang tải lại trang (lần ${tracker.reloadCount}/2)...`);

                    const logs = browserSessionLogs.get(session);
                    if (logs) {
                      logs.push({
                        time: new Date().toISOString(),
                        offer: session.offerNumber ?? session.streamRole ?? 1,
                        type: 'adtrapper_reload',
                        detail: `Đứng ở adtrapper quá 8s chưa nhảy tab. Đang tải lại trang (lần ${tracker.reloadCount}/2)...`,
                      });
                      queueSaveBrowserLogs();
                    }

                    session.updateBadge?.(`⏳ <strong>Đứng ở adtrapper:</strong> Đang tải lại lần ${tracker.reloadCount}/2…`);

                    try {
                      await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
                    } catch {
                    } finally {
                      tracker.reloading = false;
                      tracker.lastReloadAt = Date.now();
                    }
                  } else {
                    // Đã tải lại 2 lần mà vẫn đứng im ở adtrapper sau 8s → đóng trình duyệt và mở cái mới
                    blocked = true;
                    clearInterval(timer);
                    session.closingDueToTrafficBlocked = true;
                    if (autoRefill.stopRequested || !autoRefill.enabled) {
                      session.suppressAutoRefill = true;
                      session.isClosed = true;
                      activeBrowsers.delete(session);
                      await page.close().catch(() => {});
                      await session.browser?.close?.().catch(() => {});
                      if (session.proxyKey) {
                        await executeFile('pkill', ['-9', '-f', `user-data-dir.*${session.proxyKey}`]).catch(() => {});
                      }
                      return;
                    }
                    session.suppressAutoRefill = false;

                    const reason = 'Kẹt tại adtrapper không chuyển hướng sau 2 lần tải lại';
                    console.log(`[Adtrapper] ${label}: ${reason}. Đang đóng cửa sổ và mở sock khác.`);

                    try {
                      if (session.proxyKey) {
                        const history = await readProxyUsageHistory();
                        if (history?.proxies?.[session.proxyKey]) {
                          history.proxies[session.proxyKey] = {
                            ...history.proxies[session.proxyKey],
                            status: 'failed',
                            reason,
                            completedAt: new Date().toISOString(),
                          };
                          await persistProxyUsageHistory(history);
                        }
                      }
                    } catch {}

                    autoRefill.message = `${label} (IP ${session.exitIp ?? 'chưa rõ'}) bị kẹt tại adtrapper; `
                      + 'đã đóng cửa sổ và đang tự động mở sock khác thay thế…';

                    const logs = browserSessionLogs.get(session);
                    if (logs) {
                      logs.push({
                        time: new Date().toISOString(),
                        offer: session.offerNumber ?? session.streamRole ?? 1,
                        type: 'adtrapper_stuck_close',
                        detail: `${label} (IP: ${session.exitIp ?? 'chưa rõ'}) bị kẹt tại adtrapper không nhảy tab sau 2 lần tải lại. Đóng cửa sổ và đổi sock khác.`,
                      });
                      queueSaveBrowserLogs();
                    }

                    chromeBuildRotationCounter += 1;
                    await page.close().catch(() => {});
                    await session.browser?.close?.().catch(() => {});
                    if (session.proxyKey) {
                      await executeFile('pkill', ['-9', '-f', `user-data-dir.*${session.proxyKey}`]).catch(() => {});
                    }
                    if (!autoRefill.stopRequested && autoRefill.enabled) {
                      queueAutomaticRefill();
                    }
                    return;
                  }
                }
              }
            }
          } else {
            // Không còn ở adtrapper, xóa tracker
            redirectTracker.delete(page);
          }

          // 3. Phát hiện redirect sang trang không có form sau khi đã điền form → tự quay lại
          if ((session.autofillFields ?? 0) > 0 && session.initialFormUrl) {
            const curUrl = typeof page.url === 'function' ? page.url() : '';
            const isOriginOrBlank = !curUrl || curUrl === session.initialFormUrl
              || curUrl.startsWith('about:') || curUrl.startsWith('chrome:');
            if (!isOriginOrBlank) {
              const nowMs = Date.now();
              const hasInputs = await page.evaluate(() =>
                document.querySelectorAll('input:not([type="hidden"]), textarea, select').length > 0
              ).catch(() => true);
              const isThankYou = await page.evaluate(() => {
                const t = document.body?.innerText || '';
                return /thank\s*you|congratulations|confirmed|your\s*submission|application\s*received|cảm\s*ơn/i.test(t);
              }).catch(() => false)
                || /thank[-_]?you|confirmation|success|completed|receipt/i.test(curUrl);

              if (!hasInputs && !isThankYou) {
                if (session.noFormSinceUrl === curUrl && session.noFormSince && nowMs - session.noFormSince > 3000) {
                  // Đã đứng ở trang không có form >3s → go back
                  console.log(`[GoBack] Trang ${curUrl} không có form sau 3s → quay lại.`);
                  session.addBrowserLog?.({ type: 'navigate', detail: `Trang không có form sau submit (${curUrl}). Đang quay lại...` });
                  session.noFormSinceUrl = null;
                  session.noFormSince = null;
                  await page.goBack({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {});
                } else if (session.noFormSinceUrl !== curUrl) {
                  session.noFormSinceUrl = curUrl;
                  session.noFormSince = nowMs;
                }
              } else {
                session.noFormSinceUrl = null;
                session.noFormSince = null;
              }
            }
          }
        }
      } catch {
        // Tab có thể đóng hoặc chuyển trang trong lúc kiểm tra.
      } finally {
        checking = false;
      }
    })();
  }, 1000);
  timer.unref?.();
  if (typeof session.browser?.on === 'function') {
    session.browser.on('close', () => clearInterval(timer));
    session.browser.on('disconnected', () => clearInterval(timer));
  }
}

/**
 * Tự thoát khi tiến trình cha chết.
 *
 * AutoLeadPCMacApp.swift chạy node bằng Process không gắn pipe stdin, và terminate()
 * trong applicationWillTerminate không chạy khi app bị quit qua AppleScript, nên node
 * con sống sót và giữ cổng — lần mở app sau gặp EADDRINUSE. macOS re-parent con sang
 * launchd (pid 1) khi cha chết nên chỉ cần so ppid.
 *
 * @return {void} Không trả về giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
function exitWhenParentExits() {
  if (process.env.AUTOLEADPC_NO_WATCHDOG === '1') return;
  const parentPid = process.ppid;
  if (parentPid <= 1) return;

  const watchdog = setInterval(() => {
    if (process.ppid === parentPid || process.ppid <= 1) return;
    console.error('Tiến trình cha đã thoát, đóng máy chủ giao diện.');
    process.exit(0);
  }, 2000);
  // Không để watchdog là thứ giữ process sống; máy chủ HTTP làm việc đó.
  watchdog.unref();
}

/**
 * Khởi động giao diện cục bộ và mở nó trong trình duyệt mặc định của macOS.
 *
 * @return {Promise<void>} Hoàn tất khi giao diện được mở.
 * @throws {Error} Khi máy chủ giao diện không thể lắng nghe cổng cục bộ.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
async function startLocalInterface() {
  void cleanupStaleProfiles();
  // Dọn profile mồ côi định kỳ mỗi 5 phút (bắt Chrome crash không trigger close event)
  setInterval(() => void cleanupStaleProfiles(), 5 * 60 * 1000);
  await loadAutofillUsed();
  await loadAutofillQueue();
  await loadProxyQueue();
  await loadDualStreamState();
  await initializeEmailQueue();
  await loadEmailAutoRefillConfig();
  await loadProxy711Config();
  await loadProxy711AutoRefillConfig();
  await loadAutoRefillSettings();
  if (autoRefill.settings) {
    console.log('[AutoRefill] Khôi phục settings sau restart, bắt đầu bù slot...');
    void queueAutomaticRefill();
  }
  await loadSavedDeviceProfiles();
  await loadPersistedBrowserLogs();
  loadAiConfig();
  await loadToffersConfig();
  await loadLeadStats();
  startToffersBackgroundPolling(10_000);
  const interfaceHtml = readFileSync(userInterfacePath, 'utf8');
  const interfacePcHtml = existsSync(userInterfacePcPath) ? readFileSync(userInterfacePcPath, 'utf8') : interfaceHtml;
  const handlers = {
    '/launch': runExclusively(launchUserRequestedBrowsers),
    '/launch-gologin': runExclusively(launchGoLoginBrowsers),
    '/check': checkRequestedProxies,
    '/close': closeActiveBrowsers,
    '/stop': closeActiveBrowsers,
    '/auto-refill': updateAutoRefill,
    '/used-ips': listUsedExitIps,
    '/used-ips/clear': runExclusively(clearUsedProxyHistory),
    '/chrome-versions/download': runExclusively(downloadRealChromeVersions),
    '/template-profile/open': runExclusively(openTemplateProfile),
  };

  const server = createServer(async (request, response) => {
    console.log('[HTTP]', request.method, request.url);
    if (request.method === 'GET' && (request.url === '/' || request.url === '/pc' || request.url === '/mac')) {
      const servePc = request.url !== '/mac';
      const targetHtmlPath = servePc ? userInterfacePcPath : userInterfacePath;
      const htmlContent = existsSync(targetHtmlPath) ? readFileSync(targetHtmlPath, 'utf8') : (servePc ? interfacePcHtml : interfaceHtml);
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(htmlContent);
      return;
    }

    if (request.method === 'GET' && request.url === '/pc-app.png') {
      try {
        const iconPath = new URL('./pc-app.png', import.meta.url);
        if (existsSync(iconPath)) {
          const iconBuf = readFileSync(iconPath);
          response.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=86400' });
          response.end(iconBuf);
          return;
        }
      } catch {
        // ignore
      }
      response.writeHead(404); response.end();
      return;
    }

    if (request.method === 'GET' && request.url === '/favicon.ico') {
      response.writeHead(204);
      response.end();
      return;
    }

    if (request.method === 'POST' && request.url === '/script/read') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        let text = '';
        if (existsSync(body.path)) {
          text = readFileSync(body.path, 'utf8');
        }
        respondWithJson(response, 200, { content: text });
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/script/save') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const dir = dirname(body.path);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(body.path, body.content || '', 'utf8');
        respondWithJson(response, 200, { success: true });
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/pc/config/read') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const baseDir = getAutoLeadPCDir();
        const filePath = join(baseDir, 'Config', 'Proxy', body.file);
        let text = '';
        if (existsSync(filePath)) {
          text = readFileSync(filePath, 'utf8');
        }
        respondWithJson(response, 200, { content: text });
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/pc/config/save') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const baseDir = getAutoLeadPCDir();
        const filePath = join(baseDir, 'Config', 'Proxy', body.file);
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(filePath, body.content || '', 'utf8');
        respondWithJson(response, 200, { success: true });
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'GET' && request.url === '/pc/offer/read') {
      try {
        const baseDir = getAutoLeadPCDir();
        const offerDir = join(baseDir, 'Config', 'Offer');
        const filePath = join(offerDir, 'Offer.ini');
        let data = {};
        if (existsSync(filePath)) {
          const buf = readFileSync(filePath);
          let text = '';
          if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
            text = buf.toString('utf16le');
          } else {
            text = buf.toString('utf8');
          }
          const getVal = (key) => {
            const m = text.match(new RegExp(`^${key}=(.*)$`, 'm'));
            return m ? m[1].trim().replace(/\\n/g, '\n') : '';
          };
          data = {
            NameOffer: getVal('NameOffer'),
            LinkOffer: getVal('LinkOffer'),
            LinkOffer2: getVal('LinkOffer2'),
            LinkOffer3: getVal('LinkOffer3'),
            LinkOffer4: getVal('LinkOffer4'),
            Script: getVal('Script'),
            Complete: getVal('Complete'),
            TimeLimit: getVal('Timeload1') || '30',
            delayStart: getVal('delayStart') || '1',
            delayStop: getVal('delayStop') || '1',
          };
        }
        const listPath = join(offerDir, 'saved-offers.json');
        let savedList = [];
        if (existsSync(listPath)) {
          try {
            savedList = JSON.parse(readFileSync(listPath, 'utf8'));
            if (!Array.isArray(savedList)) savedList = [];
          } catch {}
        }
        respondWithJson(response, 200, { ...data, savedList });
      } catch (err) {
        respondWithJson(response, 200, { savedList: [] });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/pc/offer/save') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const baseDir = getAutoLeadPCDir();
        const offerDir = join(baseDir, 'Config', 'Offer');
        if (!existsSync(offerDir)) {
          mkdirSync(offerDir, { recursive: true });
        }
        const filePath = join(offerDir, 'Offer.ini');
        const link1 = (body.LinkOffer || '').replace(/[\r\n]+/g, '\\n');
        const link2 = (body.LinkOffer2 || '').trim();
        const link3 = (body.LinkOffer3 || '').trim();
        const link4 = (body.LinkOffer4 || '').trim();
        const iniContent = `[Setting]\nProxy=Direct\nAuto=Manual work\nCheckDuplicate=False\n[Data]\nLinkOffer=${link1}\nLinkOffer2=${link2}\nLinkOffer3=${link3}\nLinkOffer4=${link4}\nNameOffer=${body.NameOffer || ''}\nScript=${body.Script || ''}\nComplete=${body.Complete || ''}\nTimeload1=${body.TimeLimit || '30'}\nTimeload2=40\ndelayStart=${body.delayStart || '1'}\ndelayStop=${body.delayStop || '1'}\n`;
        writeFileSync(filePath, iniContent, 'utf8');

        // Lưu / cập nhật danh sách preset saved-offers.json
        const listPath = join(offerDir, 'saved-offers.json');
        let savedList = [];
        if (existsSync(listPath)) {
          try {
            savedList = JSON.parse(readFileSync(listPath, 'utf8'));
            if (!Array.isArray(savedList)) savedList = [];
          } catch {}
        }
        const offerName = (body.NameOffer || '').trim() || (body.LinkOffer || '').trim().split('\n')[0] || 'Offer ' + (savedList.length + 1);
        const offerItem = {
          id: body.id || `offer-${Date.now()}`,
          NameOffer: offerName,
          LinkOffer: body.LinkOffer || '',
          LinkOffer2: body.LinkOffer2 || '',
          LinkOffer3: body.LinkOffer3 || '',
          LinkOffer4: body.LinkOffer4 || '',
          Complete: body.Complete || '',
          TimeLimit: body.TimeLimit || '30',
          delayStart: body.delayStart || '1',
          delayStop: body.delayStop || '1',
          updatedAt: new Date().toISOString(),
        };
        const existingIdx = savedList.findIndex((item) => (item.id && item.id === offerItem.id) || item.NameOffer === offerName);
        if (existingIdx !== -1) {
          savedList[existingIdx] = { ...savedList[existingIdx], ...offerItem };
        } else {
          savedList.unshift(offerItem);
        }
        if (savedList.length > 50) savedList.length = 50;
        writeFileSync(listPath, JSON.stringify(savedList, null, 2), 'utf8');

        respondWithJson(response, 200, { success: true, savedItem: offerItem, savedList });
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/pc/offer/delete') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const baseDir = getAutoLeadPCDir();
        const listPath = join(baseDir, 'Config', 'Offer', 'saved-offers.json');
        let savedList = [];
        if (existsSync(listPath)) {
          try {
            savedList = JSON.parse(readFileSync(listPath, 'utf8'));
            if (!Array.isArray(savedList)) savedList = [];
          } catch {}
        }
        savedList = savedList.filter((item) => item.id !== body.id && item.NameOffer !== body.NameOffer);
        writeFileSync(listPath, JSON.stringify(savedList, null, 2), 'utf8');
        respondWithJson(response, 200, { success: true, savedList });
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'GET' && request.url === '/pc/settings/read') {
      try {
        const baseDir = getAutoLeadPCDir();
        const filePath = join(baseDir, 'Config', 'Settings', 'Settings.ini');
        let text = '';
        if (existsSync(filePath)) {
          text = readFileSync(filePath, 'utf8');
        }
        const getBool = (key) => {
          const m = text.match(new RegExp(`^${key}=(True|False)`, 'mi'));
          return m ? m[1].toLowerCase() === 'true' : false;
        };
        const getStr = (key) => {
          const m = text.match(new RegExp(`^${key}=(.+)`, 'mi'));
          return m ? m[1].trim() : '';
        };
        respondWithJson(response, 200, {
          Chrome: getBool('Chrome'),
          ChromeFirefox: getBool('ChromeFirefox'),
          ChromeAdsPower: getBool('ChromeAdsPower'),
          ChromeGologin: getBool('ChromeGologin'),
          Canvas: getBool('Canvas'),
          ClientRects: getBool('ClientRects'),
          WebGLImage: getBool('WebGLImage'),
          Fonts: getBool('Fonts'),
          WebRTC: getBool('WebRTC'),
          ApiFakeIP: getBool('ApiFakeIP'),
          Windows: getBool('Windows'),
          Mac: getBool('Mac'),
          Linux: getBool('Linux'),
          Android: getBool('Android'),
        });
      } catch (err) {
        respondWithJson(response, 200, {});
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/pc/settings/save') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const baseDir = getAutoLeadPCDir();
        const filePath = join(baseDir, 'Config', 'Settings', 'Settings.ini');
        const b = (val) => val ? 'True' : 'False';
        const bm = body.browserMode || 'Chrome';
        const content = `[Browser]\nChrome=${b(bm === 'Chrome')}\nChromeAdsPower=${b(bm === 'AdsPower')}\nChromeFirefox=${b(bm === 'Firefox')}\nChromeGologin=${b(bm === 'Gologin')}\n[Setting]\nCanvas=${b(body.Canvas)}\nClientRects=${b(body.ClientRects)}\nWebGLImage=${b(body.WebGLImage)}\nFonts=${b(body.Fonts)}\nWebRTC=${b(body.WebRTC)}\nApiFakeIP=${b(body.ApiFakeIP)}\n[TokensGologin]\nTokensGologin=${(existsSync(filePath) ? (readFileSync(filePath, 'utf8').match(/^TokensGologin=(.*)$/mi) || ['', ''])[1] : '')}\n[OperatingSystem]\nWindows=${b(body.Windows)}\nMac=${b(body.Mac)}\nLinux=${b(body.Linux)}\nAndroid=${b(body.Android)}\n`;
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(filePath, content, 'utf8');

        // Đồng bộ thêm vào thư mục config phụ nếu tồn tại
        const altDir = baseDir.includes('.autoleadpc') ? join(homedir(), 'Downloads', 'AutoLeadPC') : join(homedir(), '.autoleadpc');
        const altPath = join(altDir, 'Config', 'Settings', 'Settings.ini');
        if (existsSync(dirname(altPath))) {
          try { writeFileSync(altPath, content, 'utf8'); } catch {}
        }

        respondWithJson(response, 200, { success: true });
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'GET' && request.url === '/pc/commands') {
      try {
        const baseDir = getAutoLeadPCDir();
        const cmdPath = join(baseDir, 'Config', 'Command', 'command.txt');
        let text = '';
        if (existsSync(cmdPath)) {
          text = readFileSync(cmdPath, 'utf8');
        }
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const commands = lines.map((line, idx) => {
          let name = line;
          let template = line;
          if (line.startsWith('{')) {
            const m = line.match(/^\{([^}=]+)\}(?:=(.*))?$/);
            if (m) {
              name = `{${m[1]}}`;
              template = line;
            }
          } else if (line.startsWith('RandomTextFile')) {
            name = 'RandomTextFile';
          }
          return { id: idx + 1, name, template, raw: line };
        });
        respondWithJson(response, 200, { commands });
      } catch (err) {
        respondWithJson(response, 200, { commands: [] });
      }
      return;
    }

    if (request.method === 'GET' && request.url === '/pc/help') {
      try {
        const baseDir = getAutoLeadPCDir();
        const helpPath = join(baseDir, 'Help', 'Help.rtf');
        if (!existsSync(helpPath)) {
          respondWithJson(response, 200, { helpText: 'Không tìm thấy file Help.rtf' });
          return;
        }
        const buf = readFileSync(helpPath);
        const rtfStr = buf.toString('latin1');
        const plain = rtfStr
          .replace(/\\par[d]?/g, '\n')
          .replace(/\\tab/g, '\t')
          .replace(/\\[a-z0-9\-]+/gi, ' ')
          .replace(/[{}]/g, '')
          .replace(/[ \t]+/g, ' ')
          .trim();
        respondWithJson(response, 200, { helpText: plain });
      } catch {
        respondWithJson(response, 200, { helpText: 'Không tìm thấy file Help.rtf' });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/pc/browser-config/read') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const baseDir = getAutoLeadPCDir();
        const filePath = join(baseDir, 'Config', 'Browser', body.file);
        let text = '';
        if (existsSync(filePath)) {
          text = readFileSync(filePath, 'utf8');
        } else {
          const fallback = join(baseDir, 'Config', body.file);
          if (existsSync(fallback)) {
            text = readFileSync(fallback, 'utf8');
          }
        }
        respondWithJson(response, 200, { content: text });
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/pc/browser-config/save') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const baseDir = getAutoLeadPCDir();
        const filePath = join(baseDir, 'Config', 'Browser', body.file);
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(filePath, body.content || '', 'utf8');
        respondWithJson(response, 200, { success: true });
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'GET' && request.url === '/state') {
      respondWithJson(response, 200, {
        ...getAutoRefillStatus(),
        limitRun: { count: limitRunCount, max: limitRunMax },
        toffers: {
          point: latestToffersOverview.point,
          leadCount: latestToffersOverview.results?.length || 0,
          updatedAt: latestToffersOverview.updatedAt,
        },
      });
      return;
    }

    if (request.method === 'GET' && request.url === '/scripts') {
      const baseDir = getAutoLeadPCDir();
      const candidates = [
        join(baseDir, 'Script', 'Offers'),
        join(baseDir, 'Script', 'RRS'),
        join(baseDir, 'Script'),
        join(homedir(), 'Downloads', 'AutoLeadPC', 'Script', 'Offers'),
        join(homedir(), 'Downloads', 'AutoLeadPC', 'Script', 'RRS'),
        join(homedir(), 'Downloads', 'AutoLeadPC', 'Script'),
        join(homedir(), 'Desktop', 'AutoLeadPC', 'Script'),
      ];
      const scriptEntries = [];
      for (const dir of candidates) {
        try {
          const names = await readdir(dir);
          for (const name of names) {
            if (name.endsWith('.txt')) scriptEntries.push({ dir, name, path: join(dir, name) });
          }
        } catch {}
      }
      respondWithJson(response, 200, { scripts: scriptEntries });
      return;
    }

    if (request.method === 'POST' && request.url === '/limit-run/reset') {
      limitRunCount = 0;
      limitRunMax = 0;
      respondWithJson(response, 200, { message: 'Đã đặt lại bộ đếm limitRun về 0.' });
      return;
    }

    if (request.method === 'GET' && request.url === '/proxy-queue') {
      const allOfferUsed = new Set([
        ...dualStreamState.stream1Used,
        ...dualStreamState.stream2Used,
        ...[...multiOfferState.offerUsed.values()].flatMap((set) => [...set]),
      ]);
      const multiUsedCount = (multiOfferState.enabled || dualStreamState.enabled)
        ? allOfferUsed.size
        : proxyQueue.used.length;
      respondWithJson(response, 200, {
        available: proxyQueue.available.length,
        used: Math.max(proxyQueue.used.length, multiUsedCount),
        usedList: proxyQueue.used,
        dualStream: dualStreamState.enabled || multiOfferState.enabled,
        stream1Index: dualStreamState.stream1Index,
        stream2Index: dualStreamState.stream2Index,
        multiOffer: {
          enabled: multiOfferState.enabled,
          offerCount: multiOfferState.offerCount,
          activeLocks: activeProxyLocks.size,
        },
      });
      return;
    }

    // ── 711Proxy ──────────────────────────────────────────────
    if (request.method === 'GET' && request.url === '/711proxy/config') {
      respondWithJson(response, 200, {
        username: proxy711.username,
        hasToken: Boolean(proxy711.token && Date.now() < proxy711.tokenExpiry),
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/711proxy/login') {
      const body = JSON.parse(await readRequestBody(request));
      const { username, passwd } = body;
      if (!username || !passwd) { respondWithJson(response, 400, { error: 'Cần username và passwd.' }); return; }
      try {
        await fetch711Token(username, passwd);
        // Sau khi đăng nhập thành công, tự động thêm ngay IP hiện tại vào whitelist:
        let whitelistResult = null;
        try {
          const ipRes = await fetch('https://api.ipify.org?format=json').catch(() => null);
          const ip = ipRes ? (await ipRes.json().catch(() => ({}))).ip : null;
          if (ip) {
            whitelistResult = await add711IpWhitelist(ip, proxy711.token).catch((wErr) => ({ ok: false, error: wErr.message }));
          }
        } catch {}
        respondWithJson(response, 200, { ok: true, username, whitelist: whitelistResult });
      } catch (e) {
        respondWithJson(response, 400, { error: e.message });
      }
      return;
    }

    if (request.method === 'GET' && request.url === '/711proxy/autorefill') {
      respondWithJson(response, 200, { ...proxy711AutoRefill });
      return;
    }

    if (request.method === 'POST' && request.url === '/711proxy/autorefill') {
      const body = JSON.parse(await readRequestBody(request));
      if (typeof body.enabled === 'boolean') proxy711AutoRefill.enabled = body.enabled;
      if (typeof body.region === 'string') proxy711AutoRefill.region = body.region;
      if (typeof body.count === 'number') proxy711AutoRefill.count = body.count;
      if (typeof body.sessTime === 'number') proxy711AutoRefill.sessTime = body.sessTime;
      if (typeof body.sessAuto === 'boolean') proxy711AutoRefill.sessAuto = body.sessAuto;
      await saveProxy711AutoRefillConfig();
      respondWithJson(response, 200, { ...proxy711AutoRefill });
      return;
    }

    if (request.method === 'POST' && request.url === '/711proxy/logout') {
      proxy711.token = '';
      proxy711.tokenExpiry = 0;
      await saveProxy711Config();
      respondWithJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && request.url === '/711proxy/balance') {
      if (!proxy711.token || Date.now() >= proxy711.tokenExpiry) {
        respondWithJson(response, 401, { error: 'Chưa đăng nhập.' }); return;
      }
      try {
        let data;
        for (const ep of ['https://server.711proxy.com/eapi/balance/', 'https://server.711proxy.com/wapi/balance/']) {
          const r = await fetch(ep, { headers: { Authorization: `Bearer ${proxy711.token}` } });
          const t = await r.text();
          console.log(`[711Proxy] balance ${ep}:`, t.slice(0, 300));
          try { const d = JSON.parse(t); if (d && typeof d === 'object') { data = d; break; } } catch {}
        }
        if (!data) throw new Error('Không lấy được số dư.');
        respondWithJson(response, 200, data);
      } catch (e) {
        respondWithJson(response, 500, { error: e.message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/711proxy/update-whitelist') {
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json');
        const { ip } = await ipRes.json();
        const token = await ensure711Token();
        if (!token) {
          respondWithJson(response, 401, {
            error: `Chưa đăng nhập 711proxy hoặc token hết hạn. Vui lòng nhập tài khoản/mật khẩu rồi bấm 'Đăng nhập' để tự thêm IP ${ip} vào whitelist.`,
            ip,
          });
          return;
        }
        await add711IpWhitelist(ip, token);
        respondWithJson(response, 200, { ok: true, ip, message: `Đã thêm IP ${ip} vào whitelist 711proxy thành công!` });
      } catch (e) {
        respondWithJson(response, 500, { error: e.message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/711proxy/generate') {
      const body = JSON.parse(await readRequestBody(request));
      const region = (body.region || 'US').toUpperCase();
      const count = Math.min(Math.max(parseInt(body.count) || 50, 1), 200);
      const sessTime = Math.max(parseInt(body.sessTime) || 20, 1);
      const sessAuto = body.sessAuto ? 1 : 0;

      async function doGenerate() {
        const genUrl = new URL('http://global.rotgbapi.trustsource.live:8089/gen');
        genUrl.searchParams.set('zone', 'custom');
        genUrl.searchParams.set('ptype', '1');
        genUrl.searchParams.set('region', region);
        genUrl.searchParams.set('count', String(count));
        genUrl.searchParams.set('proto', 'http');
        genUrl.searchParams.set('stype', 'text');
        genUrl.searchParams.set('split', '\r\n');
        genUrl.searchParams.set('sessType', 'sticky');
        genUrl.searchParams.set('sessTime', String(sessTime));
        genUrl.searchParams.set('sessAuto', String(sessAuto));
        const res = await fetch(genUrl.toString());
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
        const text = await res.text();
        if (!text.trim() || text.includes('"code"')) throw new Error(text.slice(0, 300));
        return text;
      }

      try {
        let text;
        try {
          text = await doGenerate();
        } catch (e) {
          // Nếu lỗi whitelist → tự cập nhật IP rồi retry 1 lần
          const errMsg = e.message.toLowerCase();
          if (errMsg.includes('whitelist')) {
            const ipRes = await fetch('https://api.ipify.org?format=json').catch(() => null);
            const ip = ipRes ? (await ipRes.json().catch(() => ({}))).ip : null;
            const token = await ensure711Token();
            if (ip && token) {
              try {
                await add711IpWhitelist(ip, token);
                await new Promise((r) => setTimeout(r, 2000));
                text = await doGenerate(); // retry
              } catch (wErr) {
                throw new Error(`IP ${ip} chưa được whitelist 711proxy. Tự cập nhật whitelist thất bại (${wErr.message}). Vui lòng kiểm tra lại tài khoản hoặc vào https://dashboard.711proxy.com/whitelist/ thêm IP.`);
              }
            } else {
              throw new Error(`IP ${ip || 'của bạn'} chưa có trong whitelist 711proxy. Vui lòng nhập mật khẩu tài khoản 711proxy ở trên rồi bấm "Đăng nhập" để tự động thêm IP vào whitelist (hoặc vào https://dashboard.711proxy.com/whitelist/ thêm IP).`);
            }
          } else {
            throw e;
          }
        }
        // Chuẩn hóa: host:port → http://host:port, user:pass@host:port → http://user:pass@host:port
        const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        const proxyLines = rawLines.map((l) => {
          if (/^https?:\/\//i.test(l)) return l;
          const at = l.lastIndexOf('@');
          if (at > 0) return `http://${l.slice(0, at)}@${l.slice(at + 1)}`;
          const parts = l.split(':');
          if (parts.length === 4) return `http://${encodeURIComponent(parts[2])}:${encodeURIComponent(parts[3])}@${parts[0]}:${parts[1]}`;
          // host:port không có creds
          return `http://${l}`;
        });
        const added = importProxyLines(proxyLines, 'http');
        await saveProxyQueue();
        respondWithJson(response, 200, {
          added,
          total: proxyQueue.available.length,
          lines: proxyLines,
          preview: proxyLines.slice(0, 3),
          message: `Đã thêm ${added} proxy vào hàng đợi (tổng ${proxyQueue.available.length} sẵn sàng).`,
        });
      } catch (e) {
        respondWithJson(response, 500, { error: e.message });
      }
      return;
    }
    // ─────────────────────────────────────────────────────────

    if (request.method === 'POST' && request.url === '/proxy-queue/import') {
      const body = JSON.parse(await readRequestBody(request));
      const proxyType = body.proxyType ?? 'socks5';
      const rawLines = (body.proxyList ?? '').split(/\r?\n/)
        .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      // Validate từng dòng
      const validLines = rawLines.filter((line) => {
        try { parseProxyLine(line, 1, proxyType); return true; } catch { return false; }
      });
      // Đồng bộ: available = danh sách hợp lệ từ textarea, trừ những proxy đã dùng
      const usedSet = new Set(proxyQueue.used.map((l) => l.trim()));
      proxyQueue.available = validLines.filter((l) => !usedSet.has(l));
      await saveProxyQueue();
      respondWithJson(response, 200, {
        available: proxyQueue.available.length,
        used: proxyQueue.used.length,
        message: `Đã đồng bộ: ${proxyQueue.available.length} proxy sẵn sàng, ${proxyQueue.used.length} đã dùng.`,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/proxy-queue/reset') {
      const body = JSON.parse(await readRequestBody(request));
      const rawLines = (body.proxyList ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      const clearAll = body.clearAllUsedIps === true || rawLines.length === 0;

      if (!clearAll && rawLines.length > 0) {
        // Chỉ reset proxy nằm trong danh sách hiện tại của textarea
        const allowedSet = new Set(rawLines);
        const toRestore = proxyQueue.used.filter((line) => allowedSet.has(line.trim()));
        const keepUsed = proxyQueue.used.filter((line) => !allowedSet.has(line.trim()));
        proxyQueue.available.push(...toRestore);
        proxyQueue.used = keepUsed;
      } else {
        // Reset toàn bộ
        proxyQueue.available.push(...proxyQueue.used.splice(0));
      }
      await saveProxyQueue();
      resetMultiOfferState();
      await saveDualStreamState();

      // Xoá bản ghi trong usageHistory cho các proxy được reset để không bị chặn bởi lượt cũ
      try {
        const history = await readProxyUsageHistory();
        if (clearAll) {
          history.proxies = {};
        } else if (rawLines.length > 0) {
          const allowedServers = new Set(rawLines.map((l) => {
            try { return parseProxyLine(l, 1, 'socks5')?.server; } catch { return null; }
          }).filter(Boolean));
          for (const key of Object.keys(history.proxies)) {
            const entry = history.proxies[key];
            if (entry) {
              const matched = allowedServers.has(entry.proxy) || allowedServers.has(entry.server) ||
                rawLines.some((rl) => entry.proxy?.includes(rl) || entry.server?.includes(rl));
              if (matched) {
                delete history.proxies[key];
              }
            }
          }
        }
        await persistProxyUsageHistory(history);
      } catch {}

      respondWithJson(response, 200, {
        available: proxyQueue.available.length,
        used: proxyQueue.used.length,
        message: `Đã đặt lại: ${proxyQueue.available.length} proxy sẵn sàng dùng lại (đã làm sạch lịch sử trùng IP).`,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/proxy-queue/clear') {
      const result = await clearAllProxyQueue();
      respondWithJson(response, 200, result);
      return;
    }

    if (request.method === 'POST' && request.url === '/auto-refill/sequential') {
      const body = JSON.parse(await readRequestBody(request));
      autoRefill.sequential = body.enabled !== false;
      if (autoRefill.sequential) {
        autoRefill.enabled = true;
        const s = body.settings ?? autoRefill.settings ?? {};
        let url1 = s.websiteUrl ? normalizeUrl(s.websiteUrl) : '';
        let url2 = s.websiteUrl2 ? normalizeUrl(s.websiteUrl2) : '';
        if (!url2 && url1 && /[\r\n,]/.test(s.websiteUrl)) {
          const parts = s.websiteUrl.split(/[\r\n,]+/).map((u) => u.trim()).filter(Boolean);
          if (parts.length >= 2) {
            url1 = normalizeUrl(parts[0]);
            url2 = normalizeUrl(parts[1]);
          }
        }
        const isDual = Boolean(url1 && url2 && url1 !== url2);
        autoRefill.targetCount = isDual ? 2 : 1;
        autoRefill.settings = {
          ...s,
          websiteUrl: url1 || s.websiteUrl,
          websiteUrl2: url2 || s.websiteUrl2,
          checkDuplicate: s.checkDuplicate !== false,
        };
        autoRefill.message = isDual
          ? 'Chế độ tuần tự 2 luồng đã bật: chạy đồng thời cả 2 link (Luồng 1 từ đầu, Luồng 2 từ cuối), delay 5s giữa các phiên.'
          : 'Chế độ tuần tự đã bật: mở 1 tab mỗi lần, delay 5s giữa các phiên.';
        if (body.settings) queueAutomaticRefill(0);
      } else {
        autoRefill.sequential = false;
        autoRefill.message = 'Chế độ tuần tự đã tắt.';
      }
      respondWithJson(response, 200, { sequential: autoRefill.sequential, message: autoRefill.message, targetCount: autoRefill.targetCount });
      return;
    }

    if (request.method === 'GET' && request.url === '/autofill-queue') {
      respondWithJson(response, 200, {
        available: autofillQueue.available.length,
        used: autofillQueue.used.length,
        availableList: autofillQueue.available.slice(0, 100),
        usedList: autofillQueue.used.slice(-50),
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/autofill-queue/reset') {
      autofillQueue.available.push(...autofillQueue.used.splice(0));
      autofillUsedKeys.clear();
      await saveAutofillQueue();
      await writeFile(autofillUsedPath, JSON.stringify({ keys: [] })).catch(() => {});
      respondWithJson(response, 200, {
        available: autofillQueue.available.length,
        used: 0,
        message: `Đã đặt lại: ${autofillQueue.available.length} bản ghi thông tin sẵn sàng dùng lại.`,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/autofill-queue/import') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        let records = [];
        if (body.filePath) {
          const content = await readFile(body.filePath, 'utf8');
          records = parseAutofillRecords(content);
        } else if (body.autofillData) {
          records = parseAutofillRecords(typeof body.autofillData === 'string' ? body.autofillData : JSON.stringify(body.autofillData));
        }
        if (body.replace) {
          autofillQueue.available = [];
          autofillQueue.used = [];
          autofillUsedKeys.clear();
        }
        const added = importAutofillRecords(records);
        if (added > 0) await saveAutofillQueue();
        respondWithJson(response, 200, {
          success: true,
          added,
          available: autofillQueue.available.length,
          used: autofillQueue.used.length,
          message: `Đã nạp ${added} bản ghi info mới (tổng sẵn sàng: ${autofillQueue.available.length}).`,
        });
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'GET' && request.url === '/email-queue') {
      respondWithJson(response, 200, {
        available: emailQueue.available.length,
        used: emailQueue.used.length,
        availableList: emailQueue.available,
        usedList: emailQueue.used,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/email-queue/import') {
      const body = JSON.parse(await readRequestBody(request));
      const rawLines = (body.emailList ?? '').split(/\r?\n/)
        .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
      const added = importEmailLines(rawLines);
      if (added > 0) await saveEmailQueue();
      respondWithJson(response, 200, {
        added,
        available: emailQueue.available.length,
        used: emailQueue.used.length,
        message: `Đã nạp ${added} email mới (tổng sẵn sàng: ${emailQueue.available.length}).`,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/email-queue/reset') {
      emailQueue.available.push(...emailQueue.used.splice(0));
      await saveEmailQueue();
      respondWithJson(response, 200, {
        available: emailQueue.available.length,
        used: 0,
        message: `Đã đặt lại: ${emailQueue.available.length} email mẫu sẵn sàng dùng lại.`,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/email-queue/clear') {
      const count = emailQueue.available.length + emailQueue.used.length;
      emailQueue.available.length = 0;
      emailQueue.used.length = 0;
      await saveEmailQueue();
      respondWithJson(response, 200, { message: `Đã xóa tất cả ${count} gmail.` });
      return;
    }

    if (request.method === 'GET' && request.url === '/email-queue/autorefill') {
      respondWithJson(response, 200, { ...emailAutoRefill });
      return;
    }

    if (request.method === 'POST' && request.url === '/email-queue/autorefill') {
      const body = JSON.parse(await readRequestBody(request));
      if (typeof body.enabled === 'boolean') emailAutoRefill.enabled = body.enabled;
      if (typeof body.sourcePath === 'string') emailAutoRefill.sourcePath = body.sourcePath;
      if (typeof body.batchSize === 'number' && body.batchSize > 0) emailAutoRefill.batchSize = body.batchSize;
      if (body.resetCursor) emailAutoRefill.byteOffset = 0;
      await saveEmailAutoRefillConfig();
      respondWithJson(response, 200, { ...emailAutoRefill, message: 'Đã lưu cấu hình tự động nạp email.' });
      return;
    }

    if (request.method === 'GET' && request.url === '/autofill-used') {
      const list = [...autofillUsedKeys].map((key) => {
        try { return JSON.parse(key); } catch { return {}; }
      });
      respondWithJson(response, 200, { count: list.length, records: list });
      return;
    }

    if (request.method === 'POST' && request.url === '/autofill-used/clear') {
      autofillUsedKeys.clear();
      await writeFile(autofillUsedPath, JSON.stringify({ keys: [] })).catch(() => {});
      respondWithJson(response, 200, { message: 'Đã xóa toàn bộ thông tin đã dùng.' });
      return;
    }

    if (request.method === 'POST' && request.url === '/lead-check/resume') {
      let bodyText = '';
      for await (const chunk of request) bodyText += chunk;
      const parsed = bodyText ? JSON.parse(bodyText) : {};
      const targetSlot = Number(parsed.slot);
      let foundSession = null;
      for (const s of activeBrowsers) {
        if ((s.tileIndex + 1) === targetSlot) {
          foundSession = s;
          break;
        }
      }
      if (!foundSession) {
        respondWithJson(response, 404, { error: `Không tìm thấy trình duyệt ở slot ${targetSlot}` });
        return;
      }
      foundSession.leadCheckStatus = 'confirmed';
      foundSession.leadCheckMessage = 'Đã mở khóa thủ công. Tiếp tục tự điền form.';
      try { foundSession.triggerAutofillScan?.(); } catch {}
      respondWithJson(response, 200, { message: `Slot ${targetSlot} đã được mở khóa để tiếp tục điền form.` });
      return;
    }

    if ((request.method === 'GET' && (request.url === '/toffers/overview' || request.url.startsWith('/toffers/overview?'))) ||
        (request.method === 'POST' && request.url === '/toffers/overview')) {
      let bodyText = '';
      if (request.method === 'POST') {
        for await (const chunk of request) bodyText += chunk;
      }
      let params = {};
      try {
        if (bodyText) params = JSON.parse(bodyText);
      } catch {}

      const urlObj = new URL(request.url, 'http://localhost');
      const datas = params.datas || urlObj.searchParams.get('datas');
      const cookie = params.cookie || urlObj.searchParams.get('cookie');
      const pointUrl = params.pointUrl || urlObj.searchParams.get('pointUrl');
      const apiUrl = params.apiUrl || urlObj.searchParams.get('apiUrl');
      const forceRefresh = params.forceRefresh === true || urlObj.searchParams.get('force') === 'true';

      const customCfg = {};
      if (datas) customCfg.datas = datas;
      if (cookie) customCfg.cookie = cookie;
      if (pointUrl) customCfg.pointUrl = pointUrl;
      if (apiUrl) customCfg.apiUrl = apiUrl;

      const hasCustomParams = Object.keys(customCfg).length > 0;
      const isStale = !latestToffersOverview.updatedAt || (Date.now() - new Date(latestToffersOverview.updatedAt).getTime() > 10_000);

      try {
        if (forceRefresh || hasCustomParams || isStale) {
          const overview = await refreshToffersOverview(hasCustomParams ? customCfg : null);
          respondWithJson(response, 200, { ...overview, leadStats: Object.fromEntries(leadIpStatsMap) });
        } else {
          respondWithJson(response, 200, { ...latestToffersOverview, leadStats: Object.fromEntries(leadIpStatsMap) });
        }
      } catch (err) {
        respondWithJson(response, 500, { success: false, error: err.message, code: err.code || 'UNKNOWN_ERROR' });
      }
      return;
    }

    if (request.method === 'GET' && request.url === '/lead-stats') {
      respondWithJson(response, 200, {
        success: true,
        stats: Object.fromEntries(leadIpStatsMap),
        list: Array.from(leadIpStatsMap.values()),
        count: leadIpStatsMap.size,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/lead-stats/clear') {
      clearLeadIpStats();
      queueSaveLeadStats();
      respondWithJson(response, 200, { success: true, message: 'Đã xóa toàn bộ dữ liệu thống kê IP lead.' });
      return;
    }

    if (request.method === 'GET' && request.url === '/browser-logs') {
      const htmlCount = await countSavedHtmlFiles();
      respondWithJson(response, 200, {
        htmlDir: interactionHtmlDirectory,
        htmlCount,
        sessions: persistedBrowserLogs,
      });
      return;
    }

    if (request.method === 'GET' && request.url.startsWith('/browser-logs/export-csv')) {
      const parsedUrl = new URL(request.url, 'http://localhost');
      const offerFilter = parsedUrl.searchParams.get('offer');
      const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const rows = [
        ['Thời gian', 'Offer #', 'Slot', 'IP Exit', 'Loại sự kiện', 'Chi tiết thao tác', 'Tên file HTML', 'URL trang'].map(csvCell).join(','),
      ];
      for (const session of persistedBrowserLogs) {
        for (const entry of session.logs || []) {
          const entryOffer = String(entry.offer ?? session.offer ?? 1);
          if (offerFilter && entryOffer !== offerFilter) continue;
          rows.push([
            entry.time || '',
            entryOffer,
            session.slot ?? '',
            session.ip ?? '',
            entry.type ?? '',
            entry.detail || entry.text || entry.url || '',
            entry.htmlFilename || '',
            entry.url || session.offerUrl || '',
          ].map(csvCell).join(','));
        }
      }
      const filename = offerFilter ? `autoleadpc-offer-${offerFilter}-logs.csv` : 'autoleadpc-interaction-logs.csv';
      response.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
      });
      response.end('\uFEFF' + rows.join('\r\n'), 'utf8');
      return;
    }

    if (request.method === 'POST' && request.url === '/browser-logs/clear') {
      try {
        const rawBody = await readRequestBody(request).catch(() => '{}');
        const body = rawBody ? JSON.parse(rawBody) : {};
        const result = await clearAllLogsAndHtml(body.offer);
        respondWithJson(response, 200, result);
      } catch {
        const result = await clearAllLogsAndHtml();
        respondWithJson(response, 200, result);
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/browser-logs/open-folder') {
      try {
        const rawBody = await readRequestBody(request).catch(() => '{}');
        const body = rawBody ? JSON.parse(rawBody) : {};
        await openLogsHtmlDirectoryInFinder(body.offer);
        respondWithJson(response, 200, {
          success: true,
          message: body.offer ? `Đã mở thư mục HTML của Offer ${body.offer} trong Finder.` : 'Đã mở thư mục lưu file HTML trong Finder.',
        });
      } catch (err) {
        respondWithJson(response, 500, { error: err.message });
      }
      return;
    }

    if (request.method === 'GET' && request.url === '/proxy-usage.csv') {
      try {
        const history = await readProxyUsageHistory();
        const csv = buildProxyUsageHistoryCsv(history);
        response.writeHead(200, {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': 'attachment; filename="proxy-usage-history.csv"',
          'cache-control': 'no-store',
        });
        response.end(`\uFEFF${csv}`);
      } catch (error) {
        respondWithJson(response, 500, { error: error.message });
      }
      return;
    }

    if (request.method === 'GET' && request.url === '/ai/config') {
      const cfg = loadAiConfig();
      respondWithJson(response, 200, cfg);
      return;
    }

    if (request.method === 'POST' && request.url === '/ai/config') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const res = saveAiConfigFile(body);
        respondWithJson(response, 200, res);
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/ai/test') {
      try {
        const body = JSON.parse(await readRequestBody(request) || '{}');
        const binName = body.binary || globalAiConfig.cliBinary || 'agy';
        const augmentedPath = [
          join(homedir(), '.local', 'bin'),
          join(homedir(), '.gemini', 'antigravity-cli', 'bin'),
          '/opt/homebrew/bin',
          '/usr/local/bin',
          process.env.PATH || '',
        ].filter(Boolean).join(':');

        const { stdout } = await executeFile(binName, ['--version'], {
          env: { ...process.env, PATH: augmentedPath },
          timeout: 5000,
        });
        respondWithJson(response, 200, {
          success: true,
          binary: binName,
          version: stdout.trim(),
          message: `Đã kết nối thành công: ${binName} (${stdout.trim()})`,
        });
      } catch (err) {
        respondWithJson(response, 200, {
          success: false,
          error: err.message,
          message: `Không thể gọi binary: ${err.message}`,
        });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/ai/trigger') {
      try {
        const body = JSON.parse(await readRequestBody(request) || '{}');
        const targetSlot = Number(body.slot) || 1;
        const foundSession = [...activeBrowsers].find((s) => s.tileIndex + 1 === targetSlot);
        if (!foundSession) {
          respondWithJson(response, 404, { error: `Không tìm thấy trình duyệt ở Slot ${targetSlot}.` });
          return;
        }
        const page = foundSession.mainPage || (foundSession.browserContext?.pages().find((p) => !p.isClosed()));
        if (!page) {
          respondWithJson(response, 400, { error: `Slot ${targetSlot} không có tab nào đang mở.` });
          return;
        }
        const record = foundSession.currentRecord || (autofillQueue.available[0] ?? {});
        void runAiAssist(page, record, foundSession, {
          onLog: (entry) => foundSession.addLog?.(entry),
        });
        respondWithJson(response, 200, {
          success: true,
          message: `Đã kích hoạt AI Assist cho Slot ${targetSlot} trên trang ${page.url()}.`,
        });
      } catch (err) {
        respondWithJson(response, 500, { error: err.message });
      }
      return;
    }

    const handler = request.method === 'POST' ? handlers[request.url] : undefined;
    if (handler) {
      try {
        const body = await readRequestBody(request);
        respondWithJson(response, 200, await handler(body));
      } catch (error) {
        respondWithJson(response, 400, { error: error.message });
      }
      return;
    }

    // ─── Device profiles ─────────────────────────────────────────────────────
    if (request.method === 'GET' && request.url === '/device-profiles') {
      respondWithJson(response, 200, {
        available: Object.entries(DEVICE_PROFILES).map(([id, p]) => ({ id, label: p.label })),
        selected: autoRefill.deviceProfiles,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/device-profiles') {
      const body = JSON.parse(await readRequestBody(request));
      const valid = (body.profiles ?? []).filter((id) => DEVICE_PROFILES[id]);
      autoRefill.deviceProfiles = valid.length > 0 ? valid : ['windows'];
      void saveSavedDeviceProfiles();
      respondWithJson(response, 200, { selected: autoRefill.deviceProfiles });
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    // ─── Agent endpoints ──────────────────────────────────────────────────────
    if (request.method === 'GET' && request.url === '/agents') {
      pruneStaleAgents();
      respondWithJson(response, 200, {
        agents: [...remoteAgents.entries()].map(([id, a]) => ({
          agentId: id, platform: a.platform, hostname: a.hostname,
          maxSlots: a.maxSlots, freeSlots: a.freeSlots, activeTasks: a.activeTasks,
          enabled: a.enabled, online: Date.now() - a.lastSeen < 30_000,
        })),
        pendingTasks: pendingAgentTasks.length,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/agent/register') {
      const body = JSON.parse(await readRequestBody(request));
      const agentId = body.agentId || randomUUID();
      const existing = remoteAgents.get(agentId);
      remoteAgents.set(agentId, {
        platform: body.platform ?? 'unknown',
        hostname: body.hostname ?? agentId,
        maxSlots: body.maxSlots ?? 5,
        freeSlots: existing?.freeSlots ?? (body.maxSlots ?? 5),
        activeTasks: existing?.activeTasks ?? 0,
        lastSeen: Date.now(),
        enabled: existing?.enabled ?? true,
      });
      respondWithJson(response, 200, { agentId, ok: true });
      return;
    }

    if (request.method === 'POST' && request.url === '/agent/heartbeat') {
      const body = JSON.parse(await readRequestBody(request));
      const agent = remoteAgents.get(body.agentId);
      if (agent) { agent.lastSeen = Date.now(); agent.freeSlots = body.freeSlots ?? agent.freeSlots; }
      respondWithJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && request.url.startsWith('/agent/task')) {
      const agentId = new URL(request.url, 'http://x').searchParams.get('agentId');
      const agent = agentId ? remoteAgents.get(agentId) : null;
      if (agent) agent.lastSeen = Date.now();
      respondWithJson(response, 200, { task: pendingAgentTasks.shift() ?? null });
      return;
    }

    if (request.method === 'POST' && request.url === '/agent/result') {
      const body = JSON.parse(await readRequestBody(request));
      const agent = body.agentId ? remoteAgents.get(body.agentId) : null;
      if (agent) {
        agent.activeTasks = Math.max(0, agent.activeTasks - 1);
        agent.freeSlots = Math.min(agent.maxSlots, agent.freeSlots + 1);
        agent.lastSeen = Date.now();
      }
      if (autoRefill.enabled) queueAutomaticRefill();
      respondWithJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'POST' && request.url === '/agents/config') {
      const body = JSON.parse(await readRequestBody(request));
      const agent = body.agentId ? remoteAgents.get(body.agentId) : null;
      if (!agent) { respondWithJson(response, 404, { error: 'Agent not found' }); return; }
      agent.enabled = typeof body.enabled === 'boolean' ? body.enabled : !agent.enabled;
      respondWithJson(response, 200, { agentId: body.agentId, enabled: agent.enabled });
      return;
    }
    // ── Screen view endpoints ─────────────────────────────────────────────────
    if (request.method === 'GET' && request.url.startsWith('/screen/snapshot/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
      if (!session) { response.writeHead(404); response.end(); return; }
      try {
        const pages = session.browser.pages().filter(p => !p.isClosed());
        const page = (session.mainPage && !session.mainPage.isClosed()) ? session.mainPage : pages[0];
        if (!page) { response.writeHead(404); response.end(); return; }
        // Ảnh thu nhỏ được hỏi mỗi 1,5s: chỉ chụp một lần mỗi lúc, chụp có giới hạn thời gian và trả ảnh gần nhất
        // trong lúc chờ, để các lệnh chụp không dồn lại làm Chrome đơ.
        if (!session.snapshotInFlight) {
          session.snapshotInFlight = page.screenshot({ type: 'jpeg', quality: 65, timeout: 5000 })
            .then((buf) => { session.lastSnapshot = buf; return buf; })
            .catch(() => session.lastSnapshot ?? null)
            .finally(() => { session.snapshotInFlight = null; });
        }
        const buf = session.lastSnapshot ?? await session.snapshotInFlight;
        if (!buf) { response.writeHead(503); response.end(); return; }
        response.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' });
        response.end(buf);
      } catch { response.writeHead(503); response.end(); }
      return;
    }

    // Quản lý và cấu hình luồng Screencast chuẩn mượt mà, không bao giờ bị đen hình hay đứng FPS
    async function attachScreencastSession(scObj, cdpSession, targetPage) {
      if (scObj.keepaliveTimer) {
        clearInterval(scObj.keepaliveTimer);
        scObj.keepaliveTimer = null;
      }
      scObj.cdpClient = cdpSession;
      scObj.page = targetPage;
      scObj.lastFrameTime = Date.now();

      // 1. Kích hoạt Page domain trên CDP để đảm bảo nhận event screencastFrame
      await cdpSession.send('Page.enable').catch(() => {});

      // 2. Gắn listener TRƯỚC KHI gọi startScreencast để không bao giờ bị lỡ frame đầu
      cdpSession.on('Page.screencastFrame', (frame) => {
        scObj.lastFrameTime = Date.now();
        if (frame.metadata) {
          scObj.deviceWidth = frame.metadata.deviceWidth;
          scObj.deviceHeight = frame.metadata.deviceHeight;
        }
        if (!scObj.sseResponse.writableEnded) {
          scObj.sseResponse.write(`data: ${frame.data}\n\n`);
        }
        cdpSession.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
      });

      // 3. Bắt đầu screencast với format jpeg quality 65
      await cdpSession.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 65,
        maxWidth: 1024,
        maxHeight: 768,
        everyNthFrame: 1,
      }).catch((err) => {
        console.warn('[ScreenStream] Lỗi startScreencast:', err.message);
      });

      // 4. Gửi ngay lập tức 1 frame ban đầu bằng captureScreenshot hoặc page.screenshot để màn hình hiện ảnh trong 15ms
      try {
        const initShot = await cdpSession.send('Page.captureScreenshot', { format: 'jpeg', quality: 65 }).catch(() => null);
        if (initShot?.data && !scObj.sseResponse.writableEnded) {
          scObj.lastFrameTime = Date.now();
          scObj.sseResponse.write(`data: ${initShot.data}\n\n`);
        } else if (targetPage && !targetPage.isClosed() && !scObj.sseResponse.writableEnded) {
          const buf = await targetPage.screenshot({ type: 'jpeg', quality: 65 }).catch(() => null);
          if (buf && !scObj.sseResponse.writableEnded) {
            scObj.lastFrameTime = Date.now();
            scObj.sseResponse.write(`data: ${buf.toString('base64')}\n\n`);
          }
        }
      } catch {}

      // 5. Keepalive & Fallback Heartbeat: quá 800ms không có frame (Chrome throttle khi ẩn/minimized, trang đứng yên
      // hoặc lỗi driver) thì chủ động chụp screenshot và đẩy về SSE. Không sửa DOM trang đích để ép frame: script chống bot thấy được.
      scObj.keepaliveTimer = setInterval(async () => {
        if (scObj.sseResponse.writableEnded || !scObj.page || scObj.page.isClosed()) {
          if (scObj.keepaliveTimer) { clearInterval(scObj.keepaliveTimer); scObj.keepaliveTimer = null; }
          return;
        }
        const idleTime = Date.now() - (scObj.lastFrameTime || 0);
        if (idleTime > 800) {
          // Timer chạy mỗi 200ms: không gửi lệnh chụp mới khi lệnh trước chưa xong.
          if (scObj.captureInFlight) return;
          scObj.captureInFlight = true;
          try {
            const shot = await cdpSession.send('Page.captureScreenshot', { format: 'jpeg', quality: 65 }).catch(() => null);
            if (shot?.data && !scObj.sseResponse.writableEnded) {
              scObj.lastFrameTime = Date.now();
              scObj.sseResponse.write(`data: ${shot.data}\n\n`);
            }
          } catch {} finally {
            scObj.captureInFlight = false;
          }
        }
      }, 200);
    }

    if (request.method === 'GET' && request.url.startsWith('/screen/stream/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
      if (!session) { response.writeHead(404); response.end(); return; }

      // Không ép bung cửa sổ ra Desktop khi người dùng đang xem trực tiếp trên giao diện app (Screen View)
      try {
        if (session.showWindow && !session.hideUntilTarget && !session.hideUntilLead) {
          void session.showWindow(false);
        }
      } catch {}

      // Nếu slot đang có SSE cũ → ngắt trước
      const prev = screencastSessions.get(slot);
      if (prev) {
        if (prev.keepaliveTimer) { clearInterval(prev.keepaliveTimer); prev.keepaliveTimer = null; }
        try { await prev.cdpClient.send('Page.stopScreencast').catch(() => {}); prev.cdpClient.detach().catch(() => {}); } catch {}
        try { prev.sseResponse.end(); } catch {}
        screencastSessions.delete(slot);
      }

      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      response.write('retry: 3000\n\n');

      try {
        const pages = session.browser.pages().filter(p => !p.isClosed());
        const page = (session.mainPage && !session.mainPage.isClosed()) ? session.mainPage : pages[0];
        if (!page) { response.end(); return; }
        const cdpClient = await session.browser.newCDPSession(page);
        const scObj = { sseResponse: response };
        screencastSessions.set(slot, scObj);

        await attachScreencastSession(scObj, cdpClient, page);

        const cleanup = async () => {
          const sc = screencastSessions.get(slot);
          screencastSessions.delete(slot);
          if (sc) {
            if (sc.keepaliveTimer) { clearInterval(sc.keepaliveTimer); sc.keepaliveTimer = null; }
            try { await sc.cdpClient.send('Page.stopScreencast'); } catch {}
            try { sc.cdpClient.detach(); } catch {}
          }
        };
        request.on('close', cleanup);
        response.on('close', cleanup);
      } catch (err) {
        console.error(`[ScreenStream] Lỗi khởi tạo SSE slot ${slot}:`, err.message);
        response.write(`data: error\n\n`);
        response.end();
      }
      return;
    }

    if (request.method === 'GET' && request.url.startsWith('/screen/tabs/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
      if (!session) { respondWithJson(response, 404, { error: 'not found' }); return; }
      const pages = session.browser.pages().filter(p => !p.isClosed());
      const tabs = await Promise.all(pages.map(async (p, i) => ({
        index: i,
        url: p.url(),
        title: await p.title().catch(() => p.url()),
      })));
      respondWithJson(response, 200, { tabs });
      return;
    }

    // Đóng tab trình duyệt được chọn
    if (request.method === 'POST' && request.url.startsWith('/screen/tabs/close/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
      if (!session) { respondWithJson(response, 404, { error: 'not found' }); return; }
      try {
        const body = JSON.parse(await readRequestBody(request));
        const pages = session.browser.pages().filter(p => !p.isClosed());
        const targetIndex = body.index ?? 0;
        const targetPage = pages[targetIndex];
        if (!targetPage) { respondWithJson(response, 400, { error: 'invalid tab' }); return; }

        await targetPage.close().catch(() => {});

        let remainingPages = session.browser.pages().filter(p => !p.isClosed());
        if (remainingPages.length === 0) {
          const freshPage = await session.browser.newPage();
          await freshPage.goto('about:blank').catch(() => {});
          remainingPages = [freshPage];
        }

        const newActiveIndex = Math.max(0, Math.min(targetIndex > 0 ? targetIndex - 1 : 0, remainingPages.length - 1));
        const nextActivePage = remainingPages[newActiveIndex];
        await nextActivePage.bringToFront().catch(() => {});

        const sc = screencastSessions.get(slot);
        if (sc) {
          try { await sc.cdpClient.send('Page.stopScreencast').catch(() => {}); sc.cdpClient.detach().catch(() => {}); } catch {}
          const newCdp = await session.browser.newCDPSession(nextActivePage);
          await attachScreencastSession(sc, newCdp, nextActivePage);
        }
        respondWithJson(response, 200, { ok: true, activeIndex: newActiveIndex, remaining: remainingPages.length });
      } catch (err) { respondWithJson(response, 500, { error: err.message }); }
      return;
    }

    // Mở thêm tab mới
    if (request.method === 'POST' && request.url.startsWith('/screen/tabs/new/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
      if (!session) { respondWithJson(response, 404, { error: 'not found' }); return; }
      try {
        const newPage = await session.browser.newPage();
        await newPage.goto('about:blank').catch(() => {});
        const pages = session.browser.pages().filter(p => !p.isClosed());
        const newIndex = pages.indexOf(newPage);
        await newPage.bringToFront().catch(() => {});

        const sc = screencastSessions.get(slot);
        if (sc) {
          try { await sc.cdpClient.send('Page.stopScreencast').catch(() => {}); sc.cdpClient.detach().catch(() => {}); } catch {}
          const newCdp = await session.browser.newCDPSession(newPage);
          await attachScreencastSession(sc, newCdp, newPage);
        }
        respondWithJson(response, 200, { ok: true, index: newIndex });
      } catch (err) { respondWithJson(response, 500, { error: err.message }); }
      return;
    }

    // Chuyển tab đang xem
    if (request.method === 'POST' && request.url.startsWith('/screen/tabs/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
      if (!session) { respondWithJson(response, 404, { error: 'not found' }); return; }
      try {
        const body = JSON.parse(await readRequestBody(request));
        const pages = session.browser.pages().filter(p => !p.isClosed());
        const targetPage = pages[body.index ?? 0];
        if (!targetPage) { respondWithJson(response, 400, { error: 'invalid tab' }); return; }
        await targetPage.bringToFront();
        const sc = screencastSessions.get(slot);
        if (sc) {
          try { await sc.cdpClient.send('Page.stopScreencast').catch(() => {}); sc.cdpClient.detach().catch(() => {}); } catch {}
          const newCdp = await session.browser.newCDPSession(targetPage);
          await attachScreencastSession(sc, newCdp, targetPage);
        }
        respondWithJson(response, 200, { ok: true });
      } catch (err) { respondWithJson(response, 500, { error: err.message }); }
      return;
    }

    if (request.method === 'POST' && request.url.startsWith('/screen/input/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const sc = screencastSessions.get(slot);
      if (!sc) { respondWithJson(response, 404, { error: 'stream not open' }); return; }
      try {
        const body = JSON.parse(await readRequestBody(request));
        const { cdpClient } = sc;

        // Xử lý sự kiện chuột & cuộn bánh xe (scale toạ độ theo viewport)
        if (body.type === 'mousedown' || body.type === 'mouseup' || body.type === 'mousemove' || body.type === 'wheel') {
          const devW = sc.deviceWidth || (typeof sc.page?.viewportSize === 'function' ? sc.page.viewportSize()?.width : 0) || 1280;
          const devH = sc.deviceHeight || (typeof sc.page?.viewportSize === 'function' ? sc.page.viewportSize()?.height : 0) || 800;
          let targetX = body.x ?? 0;
          let targetY = body.y ?? 0;
          if (body.clientWidth && devW) {
            targetX = Math.round(targetX * (devW / body.clientWidth));
          }
          if (body.clientHeight && devH) {
            targetY = Math.round(targetY * (devH / body.clientHeight));
          }

          if (body.type === 'mousedown') {
            await cdpClient.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: targetX, y: targetY, button: body.button || 'left', clickCount: 1, modifiers: body.modifiers || 0 });
          } else if (body.type === 'mouseup') {
            await cdpClient.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: targetX, y: targetY, button: body.button || 'left', clickCount: 1, modifiers: body.modifiers || 0 });
            const clickedSession = [...activeBrowsers].find((item) => (item.slot ?? (item.tileIndex ?? -1) + 1) === slot);
            clickedSession?.addBrowserLog?.({ type: 'click', detail: `Click tay qua Screen View tại (${targetX}, ${targetY})` });
          } else if (body.type === 'mousemove') {
            await cdpClient.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: targetX, y: targetY, modifiers: body.modifiers || 0 });
          } else if (body.type === 'wheel') {
            const deltaX = Math.round(body.deltaX || 0);
            const deltaY = Math.round(body.deltaY || 0);
            try {
              await cdpClient.send('Input.dispatchMouseEvent', {
                type: 'mouseWheel',
                x: targetX,
                y: targetY,
                deltaX,
                deltaY,
                modifiers: body.modifiers || 0,
              });
            } catch (e) {
              if (sc.page && !sc.page.isClosed()) {
                await sc.page.evaluate((dy, dx) => {
                  window.scrollBy({ top: dy, left: dx, behavior: 'auto' });
                }, deltaY, deltaX).catch(() => {});
              }
            }
          }
        } else if (body.type === 'key' || body.type === 'keydown' || body.type === 'char') {
          // Xử lý sự kiện bàn phím thông minh qua Playwright page.keyboard (trực tiếp và không nghẽn CDP)
          if (sc.page && !sc.page.isClosed()) {
            if (body.text) {
              await sc.page.keyboard.insertText(body.text).catch(() => {});
            } else if (body.key === 'Backspace' || body.key === 'Delete' || body.key === 'Enter' || body.key === 'Tab' || body.key === 'Escape' || body.key?.startsWith('Arrow')) {
              await sc.page.keyboard.press(body.key).catch(() => {});
            } else if (body.key && body.key.length === 1 && !body.modifiers) {
              await sc.page.keyboard.insertText(body.key).catch(() => {});
            } else if (body.key) {
              let chord = '';
              if (body.modifiers) {
                if (body.modifiers & 2) chord += 'Control+';
                if (body.modifiers & 4) chord += 'Meta+';
                if (body.modifiers & 1) chord += 'Alt+';
                if (body.modifiers & 8) chord += 'Shift+';
              }
              chord += body.key;
              await sc.page.keyboard.press(chord).catch(async () => {
                if (cdpClient) {
                  await cdpClient.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: body.key, code: body.code || '', modifiers: body.modifiers || 0 }).catch(() => {});
                  await cdpClient.send('Input.dispatchKeyEvent', { type: 'keyUp', key: body.key, code: body.code || '', modifiers: body.modifiers || 0 }).catch(() => {});
                }
              });
            }
          } else if (cdpClient) {
            // Fallback trực tiếp qua CDP nếu page object không khả dụng
            if (body.text) {
              await cdpClient.send('Input.dispatchKeyEvent', { type: 'char', text: body.text }).catch(() => {});
            } else {
              await cdpClient.send('Input.dispatchKeyEvent', { type: 'keyDown', key: body.key, code: body.code || '', modifiers: body.modifiers || 0 }).catch(() => {});
              await cdpClient.send('Input.dispatchKeyEvent', { type: 'keyUp', key: body.key, code: body.code || '', modifiers: body.modifiers || 0 }).catch(() => {});
            }
          }
        }
        respondWithJson(response, 200, { ok: true });
      } catch (err) { respondWithJson(response, 500, { error: err.message }); }
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    response.writeHead(404);
    response.end('Not found');
  });

  // Không có listener thì EADDRINUSE nổ thành stack trace khi app đã chạy sẵn.
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Cổng ${port} đang có tiến trình khác dùng — AutoLeadPC Mac có thể đang mở rồi.`);
      process.exitCode = 1;
      return;
    }
    throw error;
  });

  const listenHost = process.argv.includes('--public') ? '0.0.0.0' : '127.0.0.1';
  server.listen(port, listenHost, async () => {
    const interfaceUrl = `http://127.0.0.1:${port}`;
    console.log(`AutoLeadPC Mac [Bản ${instanceId}] đang chạy tại ${interfaceUrl}`);
    if (listenHost === '0.0.0.0') console.log(`[Hub] Lắng nghe trên tất cả giao diện mạng — agent có thể kết nối qua IP LAN:${port}`);
    exitWhenParentExits();
    void startTelegramBot();
    setInterval(() => { void clearAllLogsAndHtml(); }, 5 * 60 * 1000);
    if (process.env.AUTOLEADPC_NO_OPEN === '1') return;
    try {
      await executeFile('open', [interfaceUrl]);
    } catch {
      console.log(`Mở URL này trong trình duyệt: ${interfaceUrl}`);
    }
  });
}

async function runAgentTask(task) {
  const { proxy: proxyLine, proxyType = 'socks5', record, websiteUrl, autoSubmitForm, leadConfig, deviceProfile } = task;
  const proxy = parseProxyLine(proxyLine.trim(), 1, proxyType);
  const proxyKey = createProxyUsageKey(proxy, 0);
  const builds = await listInstalledChromeChannels();
  if (builds.length === 0) throw new Error('Không có Google Chrome trên máy này');
  const build = builds[chromeBuildRotationCounter % builds.length];
  chromeBuildRotationCounter++;
  const screen = await readScreenSize();
  const tileIndex = activeBrowsers.size;
  const tile = tileAt(tileIndex, 1, screen);
  return openBrowserWithInstalledChrome({
    build, proxy, proxyKey, websiteUrl: normalizeUrl(websiteUrl),
    usedExitIps: new Set(), onExitIp: () => {}, tile, tileIndex,
    autofillRecords: record && Object.keys(record).length > 0 ? [record] : [],
    autoSubmit: autoSubmitForm !== false,
    leadConfig: leadConfig ?? {},
    deviceProfile: deviceProfile ?? getNextDeviceProfile(),
  });
}

async function startAgentMode(hubUrl) {
  const myHostname = getHostname();
  const agentId = `${myHostname}-${process.pid}`;
  const maxSlots = Math.max(3, Math.min(10, Math.floor(cpus().length / 2)));

  const post = (path, body) => fetch(`${hubUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(() => {});

  await post('/agent/register', { agentId, platform: process.platform, hostname: myHostname, maxSlots });
  console.log(`[Agent] Hub: ${hubUrl} | ID: ${agentId} | Slots: ${maxSlots}`);

  // Heartbeat mỗi 10s
  setInterval(() => {
    void post('/agent/heartbeat', { agentId, freeSlots: maxSlots - activeBrowsers.size });
  }, 10_000);

  // Poll loop
  for (;;) {
    try {
      const res = await fetch(`${hubUrl}/agent/task?agentId=${encodeURIComponent(agentId)}`);
      const { task } = await res.json();
      if (task) {
        console.log(`[Agent] Task ${task.taskId} nhận được, bắt đầu…`);
        void runAgentTask(task)
          .catch((e) => console.error(`[Agent] Task ${task.taskId} lỗi: ${e.message}`))
          .finally(() => post('/agent/result', { taskId: task.taskId, agentId, status: 'done' }));
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
}

if (import.meta.main) {
  const hubArg = process.argv.find((a) => a.startsWith('--hub='));
  if (hubArg) {
    startAgentMode(hubArg.slice(6)).catch((e) => { console.error(e.message); process.exitCode = 1; });
  } else {
    startLocalInterface().catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
