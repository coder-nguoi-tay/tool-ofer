import { createServer, get as requestHttp } from 'node:http';
import { createConnection as netCreateConnection } from 'node:net';
import { get as requestHttps } from 'node:https';
import { access, appendFile, chmod, cp, mkdir, readFile, readdir, readlink, rename, rm, writeFile } from 'node:fs/promises';
import { readFileSync, realpathSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { homedir, hostname as getHostname, cpus, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { startManualOpsRecorder } from './observer.mjs';
import { chromium } from 'playwright';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { appendFileSync } from 'node:fs';

const OFFER_HTML_FULL_DIR = '/Users/codernguoitay/offer-html-full';
mkdirSync(OFFER_HTML_FULL_DIR, { recursive: true });
const OFFER_HTML_FULL_LOG = join(OFFER_HTML_FULL_DIR, `full-capture-${Date.now()}.jsonl`);

// Ghi log HTML nối tiếp, không chặn event loop: appendFileSync ~400KB mỗi 2,5s cho mọi tab làm server giao diện
// đứng hình (bảng giật, Screen View khựng) khi chạy nhiều luồng.
let fullHtmlWriteChain = Promise.resolve();

function logFullPageHtml(page, reason = 'event') {
  try {
    if (!page || typeof page.isClosed === 'function' && page.isClosed()) return;
    page.content().then((html) => {
      // Lượt poll định kỳ chỉ ghi khi HTML đổi so với lần ghi trước của tab đó.
      const hash = createHash('sha1').update(html).digest('hex');
      if (reason === 'poll' && page._uxLastHtmlHash === hash) return;
      page._uxLastHtmlHash = hash;
      const entry = {
        ts: new Date().toISOString(),
        reason,
        url: typeof page.url === 'function' ? page.url() : '',
        title: '',
        html,
      };
      fullHtmlWriteChain = fullHtmlWriteChain
        .then(() => appendFile(OFFER_HTML_FULL_LOG, JSON.stringify(entry) + '\n'))
        .catch(() => {});
    }).catch(() => {});
  } catch {}
}

function attachFullHtmlLoggerToPage(page) {
  try {
    if (!page || page._fullHtmlLogged) return;
    page._fullHtmlLogged = true;
    page.on('load', () => logFullPageHtml(page, 'load'));
    page.on('domcontentloaded', () => logFullPageHtml(page, 'domcontentloaded'));
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) logFullPageHtml(page, 'navigated');
    });
    // Poll thưa (10s) và chỉ ghi khi HTML đổi: page.content() trên mọi tab mỗi 2,5s làm Chrome nặng.
    const iv = setInterval(() => {
      if (page.isClosed()) { clearInterval(iv); return; }
      logFullPageHtml(page, 'poll');
    }, 10000);
    logFullPageHtml(page, 'attached');
  } catch {}
}

function attachFullHtmlLoggerToBrowser(browser) {
  try {
    browser.on('page', attachFullHtmlLoggerToPage);
    try {
      for (const p of browser.pages()) {
        attachFullHtmlLoggerToPage(p);
      }
    } catch {}
    console.log(`[HTML-FULL] Logger attached to browser. Saving to ${OFFER_HTML_FULL_LOG}`);
  } catch {}
}

function attachFullHtmlLoggerToContext(context) {
  try {
    context.on('page', attachFullHtmlLoggerToPage);
    try {
      for (const p of context.pages()) {
        attachFullHtmlLoggerToPage(p);
      }
    } catch {}
  } catch {}
}
import {
  installChromeVersions,
  listInstalledChromeVersions,
} from './chrome-versions.mjs';
import { startAuthenticatedHttpRelay, startAuthenticatedSocksRelay } from './relay.mjs';
import { buildAdsPowerProfileRequest, createAdsPowerProfile, getOrCreateAdsPowerProfile, updateAdsPowerProfile, startAdsPowerProfile, stopAdsPowerProfile, deleteAdsPowerProfile, cleanupOrphanedAdsPowerProfiles, listInstalledAdsPowerKernelVersions, selectAdsPowerKernelVersions } from './adspower-profile.mjs';
import {
  applyNativeOverrides,
  attachGuardedWorkerInjection,
  buildBrandLists,
  buildProfileCoherenceExpected,
  collectProfileCoherenceSnapshot,
  analyzeProfileCoherence,
  verifyPageProfileCoherence,
  buildStealthConfig,
  buildUserAgentOverride,
  createDeviceVariant,
  localeForCountry,
  stealthInitScript,
} from './stealth.mjs';
import {
  isCloakBrowserInstalled,
  getCloakBrowserStatus,
  applyCloakHumanize,
  launchCloakBrowserPersistentContext,
} from './cloakbrowser-engine.mjs';
import { attachAutofill, parseAutofillRecords } from './autofill.mjs';
import { runAiAssist, pageHasWork, globalAiConfig, setGlobalAiConfig, callAgt } from './ai-assist.mjs';
import { startTelegramBot, reloadTelegramBot, stopTelegramBot, tgNotify, registerBotCommands } from './tgbot.mjs';
import { startTunnel, stopTunnel, getTunnelUrl } from './tunnel.mjs';

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

/**
 * Tạo bản sao độc lập (deep copy) của một record để tránh nhiều slot/tab
 * cùng tham chiếu một object trong pool dùng chung rồi ghi đè lẫn nhau.
 *
 * @param {object|null} record Record cần sao chép.
 * @return {object|null} Bản sao độc lập, hoặc null nếu đầu vào không hợp lệ.
 * @author coder-nguoi-tay
 * @since 2026-10-26
 */
/**
 * Bản sao record đã bỏ email mà phiên trước gắn vào (assignedEmail và các ô email trùng nó).
 * Dữ liệu cũ trong danh sách đã dùng còn mang email phiên; tái dùng nguyên thì phiên mới điền lại email đó.
 *
 * @param {object} record Record trong hàng đợi.
 * @return {object|null} Bản sao sạch email phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-08
 */
export function withoutSessionEmail(record) {
  const copy = safeCloneRecord(record);
  if (!copy || typeof copy !== 'object' || !copy.assignedEmail) return copy;
  for (const key of ['email', 'emailaddress', 'mail']) {
    if (copy[key] === copy.assignedEmail) delete copy[key];
  }
  delete copy.assignedEmail;
  return copy;
}

function safeCloneRecord(record) {
  if (!record || typeof record !== 'object') return record ?? null;
  try {
    return JSON.parse(JSON.stringify(record));
  } catch {
    return record;
  }
}

// Handler giữ app sống sót khi một nhánh hậu kỳ hỏng. Tuy nhiên lỗi assert luôn là
// lỗi lập trình chứ không phải lỗi runtime — nuốt nó khiến selfcheck báo "thành công"
// dù kiểm tra đã fail. Vì vậy lỗi assert luôn được ném lại để tiến trình dừng.
process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught exception:', err);
  if (err?.code === 'ERR_ASSERTION') throw err;
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
    ua: (v) => {
      const ver = String(v || '130.0.0.0');
      const safeVer = ver.includes('.') ? ver : `${ver}.0.0.0`;
      return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${safeVer} Safari/537.36`;
    },
    viewport: null, isMobile: false, hasTouch: false, deviceScaleFactor: 1,
    screen: { width: 1920, height: 1080, availHeight: 1032, frameHeight: 87 },
    uaData: { platform: 'Windows', platformVersion: '10.0.0', architecture: 'x86', bitness: '64', model: '' },
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
  enabled: false,
  settings: null,
  targetCount: 0,
  queued: false,
  message: 'Sẵn sàng. Bấm Start để bắt đầu.',
  sequential: false, // Chế độ tuần tự: 1 tab, delay 5s giữa các phiên
  deviceProfiles: ['windows'], // Danh sách profile thiết bị đang được dùng
  stopRequested: false, // Cờ yêu cầu dừng hẳn toàn bộ luồng, không mở hay bù thêm slot nào
};

/**
 * Đẩy cửa sổ ra ngoài màn hình rồi thu nhỏ để chạy ngầm trong app.
 * Chrome mới từ chối gộp windowState 'minimized' với left/top trong một lệnh
 * ("cannot be combined with 'left', 'top'...") nên cửa sổ cứ hiện ra Desktop; phải tách hai lệnh.
 *
 * @param {object} cdpSession Phiên CDP của tab trong cửa sổ.
 * @param {number} windowId ID cửa sổ từ Browser.getWindowForTarget.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-27
 */
export async function hideWindowOffscreen(cdpSession, windowId) {
  await cdpSession.send('Browser.setWindowBounds', { windowId, bounds: { left: -20000, top: -20000 } }).catch(() => {});
  await cdpSession.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
}

/**
 * Khi chạy ngầm trong app, chặn page.bringToFront(): macOS 14+ không cho app nền giành focus nên mỗi lần gọi
 * làm icon Chrome nảy trên Dock và máy giật. Nhập liệu qua CDP vẫn chạy khi tab không được focus.
 * Cửa sổ được "Hiện" (session.isWindowVisible = true) thì bringToFront chạy như cũ.
 *
 * @param {object} context BrowserContext của phiên.
 * @param {object} session Phiên đang chạy (runHidden, isWindowVisible).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-27
 */
export function suppressBringToFrontWhileHidden(context, session) {
  const guard = (page) => {
    if (!page || page._uxFrontGuard) return;
    page._uxFrontGuard = true;
    const original = page.bringToFront.bind(page);
    page.bringToFront = () => {
      // Khi chạy đa trình duyệt (nhiều cửa sổ song song) hoặc chạy ngầm trong app:
      // Chặn bringToFront cướp focus hệ điều hành để các cửa sổ không đè lên nhau,
      // không gửi sự kiện blur làm gián đoạn ô nhập và dropdown của các luồng khác.
      if (session.runHidden || (activeBrowsers && activeBrowsers.size > 1) || session.isWindowVisible !== true) {
        return Promise.resolve();
      }
      return original();
    };
  };
  context.pages().forEach(guard);
  context.on('page', guard);
}

/** Số tab offer tối đa mỗi trình duyệt (mặc định làm 3 offer); tab mở thêm vượt mức tự đóng. */
export const MAX_OFFER_TABS = 3;

/**
 * Giới hạn số tab của một phiên ở MAX_OFFER_TABS: tab mới mở khi đã đủ tab thì đóng ngay.
 * Tab không phải offer đã bị watchTrafficBlockedPage đóng riêng, nên các tab còn lại là tab offer đang làm.
 *
 * @param {object} context BrowserContext của phiên.
 * @param {object} session Phiên đang chạy.
 * @param {number} [maxTabs=MAX_OFFER_TABS] Số tab tối đa.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-27
 */
export function limitOfferTabs(context, session, maxTabs = MAX_OFFER_TABS) {
  context.on('page', (newPage) => {
    // Tab gốc do app tự mở (đa tab lúc khởi chạy) không bao giờ bị đóng vì giới hạn.
    if (session._uxOpeningOriginTabs > 0 || newPage._uxOriginTab) return;
    const openTabs = context.pages().filter((p) => !p.isClosed());
    if (openTabs.length <= maxTabs) return;
    console.log(`[TabLimit] Slot ${session.slot ?? '?'}: đã đủ ${maxTabs} tab offer, đóng tab mới mở thêm.`);
    session.addBrowserLog?.({ type: 'offer_tab_limit', detail: `Đã đủ ${maxTabs} tab offer; tự đóng tab mở thêm.` });
    newPage._uxClosedByApp = `vượt giới hạn ${maxTabs} tab offer`;
    void newPage.close().catch(() => {});
  });
}

/**
 * Tìm ô <select> dạng dropdown tại toạ độ click của Screen View. Popup native của select không có
 * trong ảnh screencast (nhất là khi chạy headless), nên Screen View tự hiện danh sách lựa chọn.
 * Select tìm thấy được gắn `data-ux-screen-select` để bước chọn sau tìm lại.
 *
 * @param {object} page Tab Playwright đang xem.
 * @param {number} x Toạ độ X (CSS px trong viewport).
 * @param {number} y Toạ độ Y (CSS px trong viewport).
 * @return {Promise<{frame: object, selectedIndex: number, options: {label: string, disabled: boolean}[]}|null>} Select tại điểm click, hoặc null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-30
 */
export async function findSelectAtPoint(page, x, y) {
  let frame = page.mainFrame();
  let px = x;
  let py = y;
  // Đi xuống tối đa 3 tầng iframe: elementFromPoint ở frame cha chỉ trả về thẻ IFRAME.
  for (let depth = 0; depth < 3; depth++) {
    const el = (await frame.evaluateHandle(([cx, cy]) => document.elementFromPoint(cx, cy), [px, py])).asElement();
    if (!el) return null;
    const uid = String(Date.now());
    const info = await el.evaluate((node, selUid) => {
      if (node.tagName === 'IFRAME' || node.tagName === 'FRAME') {
        const r = node.getBoundingClientRect();
        return { iframe: true, left: r.left + node.clientLeft, top: r.top + node.clientTop };
      }
      const sel = node.closest('select');
      // Select dạng list (size > 1 / multiple) hiện ngay trong trang nên click thường vẫn chạy.
      if (!sel || sel.disabled || sel.multiple || sel.size > 1) return null;
      sel.setAttribute('data-ux-screen-select', selUid);
      sel.focus();
      return {
        selectedIndex: sel.selectedIndex,
        options: [...sel.options].map((o) => ({ label: (o.label || o.text || o.value).trim(), disabled: o.disabled })),
      };
    }, uid);
    if (!info?.iframe) return info ? { ...info, uid, frame } : null;
    frame = await el.contentFrame();
    if (!frame) return null;
    px -= info.left;
    py -= info.top;
  }
  return null;
}

/**
 * Tìm các tab trùng link (bỏ phần #hash) với một tab khác đang mở: giữ tab gốc / tab mở trước,
 * trả về tab trùng cần đóng. Tab gốc (tab chính + tab app tự mở) không bao giờ nằm trong kết quả,
 * vì chế độ đa tab cố ý mở cùng một link ở nhiều tab gốc.
 *
 * @param {object[]} pages Các tab của phiên, theo thứ tự mở.
 * @param {(page: object) => boolean} isOrigin Tab có phải tab gốc không.
 * @return {object[]} Các tab trùng link cần đóng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-28
 */
export function findDuplicateTabs(pages, isOrigin) {
  const linkOf = (page) => {
    const url = String(page.url?.() || '');
    return /^https?:/i.test(url) ? url.split('#')[0] : '';
  };
  const open = pages.filter((p) => !p.isClosed?.() && linkOf(p));
  const seen = new Set(open.filter(isOrigin).map(linkOf));
  const duplicates = [];
  for (const page of open) {
    if (isOrigin(page)) continue;
    const link = linkOf(page);
    if (seen.has(link)) duplicates.push(page);
    else seen.add(link);
  }
  return duplicates;
}

/**
 * Chỉ cho phép tên file cấu hình đơn giản (không thư mục, không ".."): các endpoint /pc/config và
 * /pc/browser-config ghép thẳng body.file vào đường dẫn nên trước đây đọc/ghi được file bất kỳ trên máy.
 *
 * @param {string} name Tên file do giao diện gửi lên.
 * @return {string} Tên file an toàn.
 * @throws {Error} Khi tên file không hợp lệ.
 */
export function safeConfigFileName(name) {
  const fileName = String(name ?? '');
  if (!/^[\w .-]+$/.test(fileName) || fileName.includes('..')) throw new Error('Tên file cấu hình không hợp lệ');
  return fileName;
}

/** Lấy profile thiết bị tiếp theo theo vòng tròn xoay vòng toàn cục. */
export function getNextDeviceProfile() {
  const profiles = autoRefill.deviceProfiles?.length > 0 ? autoRefill.deviceProfiles : ['windows'];
  const profile = profiles[deviceProfileRotationCounter % profiles.length];
  deviceProfileRotationCounter += 1;
  return profile;
}

/**
 * Đọc các profile thiết bị được chọn trong Settings và lưu làm cấu hình xoay vòng.
 *
 * @param {object} settings Cấu hình có thể gồm Windows, Mac, Linux và Android.
 * @return {string[]|null} ID profile đã chọn hoặc null nếu request không có các trường thiết bị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
function syncDeviceProfilesFromSettings(settings) {
  const settingKeys = ['Windows', 'Mac', 'Linux', 'Android', 'iPhone', 'iPad'];
  if (!settingKeys.some((key) => Object.hasOwn(settings, key))) return null;

  const selectedProfiles = [
    settings.Windows && 'windows',
    settings.Mac && 'macos',
    settings.Linux && 'linux',
    settings.Android && 'android',
    settings.iPhone && 'ios',
    settings.iPad && 'ipad',
  ].filter(Boolean);
  autoRefill.deviceProfiles = selectedProfiles.length > 0 ? selectedProfiles : ['macos'];
  void saveSavedDeviceProfiles();
  return autoRefill.deviceProfiles;
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
 * Nhận diện duy nhất của một proxy kết hợp cả server và username (dành cho proxy xoay sticky session).
 *
 * @param {object|null} proxy Đối tượng proxy.
 * @return {string} Chuỗi JSON định danh.
 */
export function proxyIdentity(proxy) {
  return JSON.stringify([proxy?.server ?? '', proxy?.username ?? '']);
}

/**
 * Khóa duy nhất đại diện cho proxy trong hàng đợi và lịch sử dùng:
 * Ưu tiên _queueLine gốc (chứa đầy đủ session, pass, port), fallback về proxyIdentity.
 *
 * @param {object|null} proxy Đối tượng proxy.
 * @return {string} Khóa định danh duy nhất.
 */
export function getProxyUniqueKey(proxy) {
  if (!proxy) return '';
  if (proxy._queueLine) return proxy._queueLine;
  return proxyIdentity(proxy);
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
 * Bản đồ chiến lược giải offer theo từng offerNumber.
 * Mỗi offer link có thể cấu hình cách bấm/trả lời khác nhau:
 * - 'auto_full': tự động điền toàn bộ form và tích checkbox (mặc định).
 * - 'consent_only': chỉ tích ô consent/điều khoản, không điền các trường khác.
 * - 'manual': không tự động giải, chờ người thao tác thủ công.
 * - 'skip': bỏ qua offer này, không mở.
 * @type {Map<number, { mode: string; autoSubmit: boolean; maxPick?: number; pickRandom?: boolean; notes?: string }>}
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-22
 */
export const offerStrategyState = new Map();

/**
 * Nạp chiến lược đã lưu trước khi khôi phục phiên tự bù sau khi mở ứng dụng.
 *
 * @return {Promise<void>} Hoàn tất cập nhật bản đồ chiến lược.
 * @throws {never} File thiếu hoặc sai định dạng được bỏ qua an toàn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-23
 */
export async function loadOfferStrategies() {
  try {
    const path = join(getAutoLeadPCDir(), 'Config', 'Offer', 'offer-methods.json');
    const methods = JSON.parse(await readFile(path, 'utf8'));
    if (!Array.isArray(methods)) return;
    offerStrategyState.clear();
    for (const item of methods) {
      const number = Number(item?.offerNumber);
      if (!Number.isInteger(number) || number < 1 || number > 30) continue;
      offerStrategyState.set(number, {
        mode: ['auto_full', 'consent_only', 'manual', 'skip'].includes(item.mode) ? item.mode : 'auto_full',
        autoSubmit: item.autoSubmit !== false,
        maxPick: Number.isInteger(Number(item.maxPick)) && Number(item.maxPick) > 0 ? Number(item.maxPick) : null,
        pickRandom: item.pickRandom === true,
        notes: String(item.notes || ''),
        link: String(item.link || '').trim(),
      });
    }
  } catch {
    // Cấu hình offer chưa được lưu lần đầu.
  }
}

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
  const pKey = getProxyUniqueKey(proxy);
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

    const pKey = getProxyUniqueKey(candidate);

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

      const pKey = getProxyUniqueKey(candidate);
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
const adsPowerApiKeyPath = join(appDataDirectory, 'adspower-api-key.txt');
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

/**
 * Đọc khóa Local API AdsPower dùng cho profile SunBrowser của các slot.
 *
 * @return {Promise<string>} API key đã lưu hoặc chuỗi rỗng.
 * @throws {Error} Khi file khóa tồn tại nhưng không thể đọc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
async function readAdsPowerApiKey() {
  try {
    return (await readFile(adsPowerApiKeyPath, 'utf8')).trim();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return '';
  }
}

/**
 * Lưu khóa Local API AdsPower chỉ cho tài khoản macOS đang chạy AutoLeadPC.
 *
 * @param {string} apiKey API key từ AdsPower > Automation > API & MCP.
 * @return {Promise<void>} Hoàn tất ghi khóa với quyền 0600.
 * @throws {Error} Khi khóa chứa dòng mới hoặc không thể ghi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
async function saveAdsPowerApiKey(apiKey) {
  const normalizedKey = String(apiKey ?? '').trim();
  if (/[\r\n]/.test(normalizedKey)) throw new Error('AdsPower API key không hợp lệ.');
  await mkdir(appDataDirectory, { recursive: true, mode: 0o700 });
  await writeFile(adsPowerApiKeyPath, normalizedKey, { mode: 0o600 });
  await chmod(adsPowerApiKeyPath, 0o600);
}

const remoteAgents = new Map();
// Tasks dequeued from proxy/autofill queue, waiting for a remote agent to pick up
const pendingAgentTasks = [];
const userInterfacePath = new URL('./index.html', import.meta.url);
const userInterfacePcPath = new URL('./index-pc.html', import.meta.url);
const userInterfaceMiniPath = new URL('./screen-mini.html', import.meta.url);
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

/**
 * Lưu toàn bộ log trình duyệt đã ghi nhận xuống đĩa mà không cắt bỏ lịch sử cũ.
 *
 * @return {Promise<void>} Hoàn tất sau khi ghi dữ liệu log.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
export async function savePersistedBrowserLogs() {
  try {
    await mkdir(interactionLogDirectory, { recursive: true });
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

/**
 * Đóng gói toàn bộ log, mã HTML và ảnh chụp giao diện để người dùng tải xuống.
 *
 * @return {Promise<Buffer>} Nội dung ZIP chứa lịch sử giao diện đã lưu.
 * @throws {Error} Khi không thể tạo hoặc đọc tệp ZIP.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
export async function createBrowserLogsArchive() {
  await mkdir(interactionHtmlDirectory, { recursive: true });
  await savePersistedBrowserLogs();
  const archivePath = join(tmpdir(), `autoleadpc-interfaces-${randomUUID()}.zip`);
  try {
    await executeFile('zip', ['-q', '-r', archivePath, 'browser-logs.json', 'html'], {
      cwd: interactionLogDirectory,
      maxBuffer: 10 * 1024 * 1024,
    });
    return await readFile(archivePath);
  } finally {
    await rm(archivePath, { force: true }).catch(() => {});
  }
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
/** Chu kỳ tự xoá log (ms). */
export const LOG_PURGE_INTERVAL_MS = 10 * 60 * 1000;

/**
 * Xoá log định kỳ: log trình duyệt + file HTML đã lưu (như nút "Xóa log"), và file chụp HTML trong
 * offer-html-full (xoá file cũ, làm rỗng file đang ghi) để ổ đĩa không phình (đã từng lên 9,7 GB).
 *
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-28
 */
async function purgeLogsPeriodically() {
  await clearAllLogsAndHtml().catch(() => {});
  const files = await readdir(OFFER_HTML_FULL_DIR).catch(() => []);
  for (const name of files) {
    const filePath = join(OFFER_HTML_FULL_DIR, name);
    if (name.endsWith('.jsonl') && filePath !== OFFER_HTML_FULL_LOG) await rm(filePath, { force: true }).catch(() => {});
  }
  // Làm rỗng file đang ghi qua cùng hàng đợi ghi để không cắt ngang một dòng đang ghi dở.
  fullHtmlWriteChain = fullHtmlWriteChain.then(() => writeFile(OFFER_HTML_FULL_LOG, '')).catch(() => {});
  console.log(`[LogCleanup] Đã xoá log trình duyệt, file HTML và file chụp HTML (chu kỳ ${LOG_PURGE_INTERVAL_MS / 60000} phút).`);
}

const autoRefillSettingsPath = join(appDataDirectory, 'autorefill-settings.json');
/** Cấu hình lần bấm Start gần nhất; không bị xoá khi Stop (dùng cho /run trên Telegram). */
const lastLaunchSettingsPath = join(appDataDirectory, 'last-launch-settings.json');

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

/**
 * Khôi phục cấu hình tự bù; bỏ qua cấu hình GoLogin cũ sau khi chuyển sang AdsPower.
 *
 * @return {Promise<void>} Hoàn tất nạp cấu hình tương thích.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
async function loadAutoRefillSettings() {
  try {
    const raw = JSON.parse(await readFile(autoRefillSettingsPath, 'utf8'));
    if (raw?.settings) {
      if (raw.settings.browserMode === 'Gologin') {
        autoRefill.message = 'Cấu hình GoLogin cũ đã bỏ qua; hãy chọn AdsPower và bấm Start.';
        return;
      }
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

// ══════════════════════════════════════════════════════════════════════════
// BANDWIDTH TRACKING & DAILY STATS
// ══════════════════════════════════════════════════════════════════════════
export const bandwidthStatsPath = join(appDataDirectory, 'bandwidth-daily.json');
let saveBandwidthTimer = null;

export const bandwidthDailyStats = {
  totalBytesAllTime: 0,
  totalUploadAllTime: 0,
  totalDownloadAllTime: 0,
  totalRequestsAllTime: 0,
  daily: {},
};

export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i <= 0) return `${Math.round(bytes)} B`;
  const val = (bytes / Math.pow(k, i)).toFixed(dm);
  return `${val} ${sizes[i]}`;
}

export function getLocalDateKey() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function loadBandwidthStats() {
  try {
    const raw = JSON.parse(await readFile(bandwidthStatsPath, 'utf8'));
    if (raw && typeof raw === 'object') {
      bandwidthDailyStats.totalBytesAllTime = Number(raw.totalBytesAllTime) || 0;
      bandwidthDailyStats.totalUploadAllTime = Number(raw.totalUploadAllTime) || 0;
      bandwidthDailyStats.totalDownloadAllTime = Number(raw.totalDownloadAllTime) || 0;
      bandwidthDailyStats.totalRequestsAllTime = Number(raw.totalRequestsAllTime) || 0;
      bandwidthDailyStats.daily = (raw.daily && typeof raw.daily === 'object') ? raw.daily : {};
    }
    console.log(`[Bandwidth] Đã tải thống kê băng thông (${Object.keys(bandwidthDailyStats.daily).length} ngày, tổng all-time: ${formatBytes(bandwidthDailyStats.totalBytesAllTime)})`);
  } catch {}
}

export function queueSaveBandwidthStats() {
  if (saveBandwidthTimer) return;
  saveBandwidthTimer = setTimeout(async () => {
    saveBandwidthTimer = null;
    try {
      await mkdir(appDataDirectory, { recursive: true });
      await writeFile(bandwidthStatsPath, JSON.stringify(bandwidthDailyStats, null, 2), 'utf8');
    } catch (err) {
      console.warn('[Bandwidth] Lỗi khi lưu bandwidth-daily.json:', err.message);
    }
  }, 2000);
}

export function saveBandwidthStatsSync() {
  try {
    mkdirSync(appDataDirectory, { recursive: true });
    writeFileSync(bandwidthStatsPath, JSON.stringify(bandwidthDailyStats, null, 2), 'utf8');
  } catch {}
}

process.on('exit', () => {
  saveBandwidthStatsSync();
});

export function recordBandwidthUsage(bytes, up = 0, down = 0) {
  if (bytes <= 0 && up <= 0 && down <= 0) return;
  const dateKey = getLocalDateKey();
  if (!bandwidthDailyStats.daily[dateKey]) {
    bandwidthDailyStats.daily[dateKey] = {
      date: dateKey,
      bytesSent: 0,
      bytesReceived: 0,
      totalBytes: 0,
      requestCount: 0,
    };
  }
  const day = bandwidthDailyStats.daily[dateKey];
  day.bytesSent = (day.bytesSent || 0) + up;
  day.bytesReceived = (day.bytesReceived || 0) + down;
  day.totalBytes = (day.totalBytes || 0) + bytes;
  day.requestCount = (day.requestCount || 0) + 1;

  bandwidthDailyStats.totalUploadAllTime += up;
  bandwidthDailyStats.totalDownloadAllTime += down;
  bandwidthDailyStats.totalBytesAllTime += bytes;
  bandwidthDailyStats.totalRequestsAllTime += 1;

  queueSaveBandwidthStats();
}

export function attachBandwidthTracker(context, session) {
  if (!context || !session) return;
  if (session._bandwidthTrackerAttached) return;
  session._bandwidthTrackerAttached = true;

  session.bandwidthBytes = session.bandwidthBytes || 0;
  session.bytesSent = session.bytesSent || 0;
  session.bytesReceived = session.bytesReceived || 0;
  session.requestCount = session.requestCount || 0;
  session.bandwidthFormatted = formatBytes(session.bandwidthBytes);

  const handleRequestFinishedOrFailed = async (req) => {
    try {
      const sizes = await req.sizes().catch(() => null);
      if (!sizes) return;
      const up = Math.max(0, (sizes.requestHeadersSize || 0) + (sizes.requestBodySize || 0));
      const down = Math.max(0, (sizes.responseHeadersSize || 0) + (sizes.responseBodySize || 0));
      const bytes = up + down;
      if (bytes <= 0) return;

      session.bytesSent = (session.bytesSent || 0) + up;
      session.bytesReceived = (session.bytesReceived || 0) + down;
      session.bandwidthBytes = (session.bandwidthBytes || 0) + bytes;
      session.requestCount = (session.requestCount || 0) + 1;
      session.bandwidthFormatted = formatBytes(session.bandwidthBytes);

      // Ghi nhận băng thông cho từng tab cụ thể
      const page = req.frame()?.page?.();
      if (page) {
        page._bytesSent = (page._bytesSent || 0) + up;
        page._bytesReceived = (page._bytesReceived || 0) + down;
        page._bandwidthBytes = (page._bandwidthBytes || 0) + bytes;
        page._requestCount = (page._requestCount || 0) + 1;
        page._bandwidthFormatted = formatBytes(page._bandwidthBytes);
      }

      recordBandwidthUsage(bytes, up, down);
    } catch {}
  };

  context.on('requestfinished', handleRequestFinishedOrFailed);
  context.on('requestfailed', handleRequestFinishedOrFailed);
}

/**
 * Danh sách domain chuyên phân phối video quảng cáo, banner quảng cáo video nặng
 * và các dịch vụ quay lén thao tác màn hình (session replay) gây ngốn băng thông proxy.
 * Tuyệt đối KHÔNG chứa domain của Captcha, Cloudflare, hay tracking affiliate.
 */
export const HEAVY_AD_AND_TRACKER_HOSTS = [
  // Video Ad Networks & Outstream Video Players
  'vidoomy.com',
  'connatix.com',
  'anyclip.com',
  'playwire.com',
  'aniview.com',
  'primis.tech',
  'teads.tv',
  'spotxchange.com',
  'spotx.tv',
  'outbrain.com',
  'taboola.com',
  'adnxs.com',
  'criteo.com',
  'criteo.net',
  'pubmatic.com',
  'rubiconproject.com',
  'openx.net',
  'smartadserver.com',
  'adroll.com',
  'moatads.com',
  'scorecardresearch.com',
  'yieldmo.com',
  'adcolony.com',
  'inmobi.com',
  'undertone.com',
  'gumgum.com',
  'triplelift.com',
  'serving-sys.com',
  'flashtalking.com',

  // Google Heavy Video Ad Subdomains (chỉ chặn endpoint quảng cáo video/banner của google, không chặn recaptcha/auth)
  'pubads.g.doubleclick.net',
  'securepubads.g.doubleclick.net',
  'pagead2.googlesyndication.com',
  'adservice.google.com',

  // Heavy Session Replay & Screen Recording (truyền stream thao tác màn hình về server)
  'hotjar.com',
  'clarity.ms',
  'fullstory.com',
  'mouseflow.com',
  'crazyegg.com',
  'smartlook.com',
  'luckyorange.com',
];

/**
 * Kiểm tra xem URL có phải là hình ảnh không.
 * Cần giữ lại 100% hình ảnh (trắc nghiệm bằng hình ảnh, logo, ảnh captcha, ảnh minh họa).
 *
 * @param {string} url
 * @return {boolean}
 */
export function isImageUrl(url) {
  if (!url) return false;
  return /\.(png|jpe?g|gif|webp|svg|ico|bmp|avif)($|\?)/i.test(url);
}

/**
 * Kiểm tra xem URL có phải là tài nguyên bảo mật / captcha / lead tracker thiết yếu không.
 *
 * @param {string} url
 * @return {boolean}
 */
export function isEssentialOfferUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('recaptcha') ||
    lower.includes('hcaptcha') ||
    lower.includes('challenges.cloudflare.com') ||
    lower.includes('turnstile') ||
    lower.includes('arkoselabs') ||
    lower.includes('funcaptcha') ||
    lower.includes('geetest') ||
    lower.includes('google.com/recaptcha') ||
    lower.includes('gstatic.com/recaptcha') ||
    lower.includes('/cdn-cgi/challenge-platform') ||
    lower.includes('/cdn-cgi/trace')
  );
}

/**
 * Kiểm tra xem URL có phải là file media nặng (video, audio, streaming video chunks) không.
 *
 * @param {string} url
 * @return {boolean}
 */
export function isMediaUrl(url) {
  if (!url) return false;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(mp4|webm|m3u8|ts|ogg|mp3|wav|flv|avi|mkv|m4s|mov|aac|f4v|mpd)$/i.test(pathname);
  } catch {
    return /\.(mp4|webm|m3u8|ts|ogg|mp3|wav|flv|avi|mkv|m4s|mov|aac|f4v|mpd)($|\?)/i.test(url);
  }
}

/**
 * Kiểm tra xem URL có thuộc danh sách mạng quảng cáo video/tracker nặng không.
 *
 * @param {string} url
 * @return {boolean}
 */
export function isHeavyAdOrTrackerUrl(url) {
  if (!url || isEssentialOfferUrl(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return HEAVY_AD_AND_TRACKER_HOSTS.some((badHost) => host === badHost || host.endsWith('.' + badHost));
  } catch {
    return false;
  }
}

/**
 * Gắn bộ lọc Data Saver để tiết kiệm băng thông proxy cho phiên duyệt web.
 * NGUYÊN TẮC BẢO TOÀN TRẢI NGHIỆM & LEAD (CỐT LÕI):
 * 1. TUYỆT ĐỐI KHÔNG CHẶN ẢNH (image): Logo câu hỏi, Captcha, hình ảnh khảo sát luôn hiển thị 100%.
 * 2. TUYỆT ĐỐI KHÔNG CHẶN JAVASCRIPT, API, TÀI LIỆU, IFRAME & CSS:
 *    - Toàn bộ mã script khảo sát, các lựa chọn trả lời, nút Next/Submit, DOM động được bảo toàn 100%.
 *    - Không chặn XHR/Fetch gọi API câu hỏi & nộp đáp án.
 * 3. CHẶN TRIỆT ĐỂ MEDIA (video / audio / m3u8 / ts / m4s / webm streaming):
 *    - Đây là thủ phạm chính gây tốn 95%-99% băng thông proxy do các video ad tự phát ngầm.
 *    - Chặn video stream giúp tiết kiệm tối đa data proxy mà không bao giờ làm mất câu hỏi hay câu trả lời.
 *
 * @param {object} context BrowserContext của Playwright.
 * @param {object} session Phiên duyệt web.
 * @return {Promise<void>}
 */
export async function attachDataSaver(context, session) {
  if (!context || !session) return;
  if (session._dataSaverAttached) return;
  session._dataSaverAttached = true;

  try {
    await context.route('**/*', async (route) => {
      try {
        const req = route.request();
        const type = req.resourceType();
        const url = req.url() || '';

        // 1. TUYỆT ĐỐI KHÔNG CHẶN ẢNH (Ảnh logo câu hỏi, Captcha, minh hoạ...)
        if (type === 'image' || isImageUrl(url)) {
          return route.continue().catch(() => {});
        }

        // 2. TUYỆT ĐỐI KHÔNG CHẶN JAVASCRIPT, TÀI LIỆU, IFRAME VÀ STYLESHEET
        // Bảo đảm 100% JavaScript câu hỏi, các lựa chọn trả lời và cấu trúc trang web hoạt động hoàn hảo
        if (
          type === 'script' ||
          type === 'document' ||
          type === 'subdocument' ||
          type === 'stylesheet' ||
          type === 'font'
        ) {
          return route.continue().catch(() => {});
        }

        // 3. Không chặn tài nguyên bảo mật / captcha thiết yếu (Captcha, Cloudflare Turnstile, Auth)
        if (isEssentialOfferUrl(url)) {
          return route.continue().catch(() => {});
        }

        // 4. CHẶN TRIỆT ĐỂ MEDIA (video / audio / m3u8 / ts streaming)
        // Áp dụng cho cả thẻ <video>/<audio> lẫn các chunk video stream được kéo bằng fetch/xhr
        if (type === 'media' || isMediaUrl(url)) {
          session.blockedMediaCount = (session.blockedMediaCount || 0) + 1;
          return route.abort('blockedbyclient').catch(() => {});
        }

        // 5. KHÔNG CHẶN XHR / FETCH (API câu hỏi, submit form, lead verification)
        // Trừ các file video chunk đã bị lọc ở bước 4 ở trên
        if (type === 'xhr' || type === 'fetch') {
          return route.continue().catch(() => {});
        }

        // 6. Chặn các kết nối rác bên thứ 3 còn lại (session replay streaming, socket ngầm)
        // Không ảnh hưởng tới script, API hay hình ảnh vì đã được cho qua ở các bước trên
        if (isHeavyAdOrTrackerUrl(url)) {
          session.blockedAdsCount = (session.blockedAdsCount || 0) + 1;
          return route.abort('blockedbyclient').catch(() => {});
        }

        return route.continue().catch(() => {});
      } catch {
        return route.continue().catch(() => {});
      }
    });

    session.addBrowserLog?.({
      type: 'data_saver_active',
      detail: 'Đã kích hoạt Chế độ Tiết Kiệm Băng Thông: Tự động chặn Video/Audio streaming (bảo toàn 100% JavaScript, câu hỏi, câu trả lời và hình ảnh).',
    });
    console.log(`[DataSaver] Slot ${session.slot || '?'}: Đã kích hoạt Chế độ Tiết Kiệm Băng Thông (bảo toàn 100% JS & câu trả lời).`);
  } catch (err) {
    console.warn(`[DataSaver] Slot ${session.slot || '?'}: Lỗi gắn route:`, err.message);
  }
}

export function getBandwidthSummary() {
  const todayKey = getLocalDateKey();
  const todayStats = bandwidthDailyStats.daily[todayKey] || {
    date: todayKey,
    bytesSent: 0,
    bytesReceived: 0,
    totalBytes: 0,
    requestCount: 0,
  };

  const dailyList = Object.values(bandwidthDailyStats.daily).map((d) => ({
    ...d,
    formatted: formatBytes(d.totalBytes || 0),
    sentFormatted: formatBytes(d.bytesSent || 0),
    receivedFormatted: formatBytes(d.bytesReceived || 0),
  })).sort((a, b) => b.date.localeCompare(a.date));

  return {
    today: {
      ...todayStats,
      formatted: formatBytes(todayStats.totalBytes || 0),
      sentFormatted: formatBytes(todayStats.bytesSent || 0),
      receivedFormatted: formatBytes(todayStats.bytesReceived || 0),
    },
    allTime: {
      totalBytes: bandwidthDailyStats.totalBytesAllTime,
      bytesSent: bandwidthDailyStats.totalUploadAllTime,
      bytesReceived: bandwidthDailyStats.totalDownloadAllTime,
      requestCount: bandwidthDailyStats.totalRequestsAllTime,
      formatted: formatBytes(bandwidthDailyStats.totalBytesAllTime),
      sentFormatted: formatBytes(bandwidthDailyStats.totalUploadAllTime),
      receivedFormatted: formatBytes(bandwidthDailyStats.totalDownloadAllTime),
    },
    daily: dailyList,
    proxy711: getCached711Balance(),
  };
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
export const proxy711 = {
  authMode: 'subuser', // 'subuser' (User/Pass Auth - khuyên dùng) hoặc 'api' (IP Whitelist)
  username: '',
  passwd: '',
  token: '',
  tokenExpiry: 0,
  wapiToken: '',
  wapiTokenExpiry: 0,
  packageGb: 0,
  subuser: '',
  subpass: '',
  gatewayHost: 'global.rotgbapi.trustsource.live',
  gatewayPort: 10000,
};
const proxy711AutoRefillConfigPath = join(appDataDirectory, '711proxy-autorefill.json');
const proxy711AutoRefill = { enabled: false, region: 'US', count: 50, sessTime: 20, sessAuto: false };
let proxy711AutoRefilling = false;

let cached711Balance = {
  ok: false,
  flow_balance: 0,
  flowFormatted: '0 B',
  remainingGb: 0,
  remainingFormatted: '0 GB',
  packageGb: 0,
  packageFormatted: '0 GB',
  usedGb: 0,
  usedFormatted: '0 GB',
  usedPercent: 0,
  remainingPercent: 0,
  lastUpdated: 0,
  error: null,
};

export function getCached711Balance() {
  return cached711Balance;
}

export async function get711Balance(force = false) {
  if (!force && cached711Balance.ok && (Date.now() - cached711Balance.lastUpdated < 15_000)) {
    return cached711Balance;
  }

  const token = await ensure711Token();
  if (!token) {
    cached711Balance = {
      ...cached711Balance,
      ok: false,
      error: 'Chưa đăng nhập 711proxy.',
    };
    return cached711Balance;
  }

  try {
    const candidateBalanceUrls = [
      'https://server.711proxy.com/eapi/balance/',
      'https://server.711proxy.com/wapi/balance/',
    ];
    let data = null;
    let text = '';
    for (const url of candidateBalanceUrls) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        text = await res.text();
        try { data = JSON.parse(text); } catch {}
        if (data && (data.code === 200 || data.code === 0) && typeof data.flow_balance === 'number') {
          break;
        }
      } catch {}
    }

    if (data?.code === 41010 || data?.error?.toLowerCase().includes('token')) {
      proxy711.token = '';
      proxy711.tokenExpiry = 0;
      await saveProxy711Config();
      if (proxy711.username && proxy711.passwd) {
        const freshToken = await fetch711Token(proxy711.username, proxy711.passwd).catch(() => null);
        if (freshToken) {
          for (const url of candidateBalanceUrls) {
            try {
              const res = await fetch(url, {
                headers: { Authorization: `Bearer ${freshToken}` },
              });
              text = await res.text();
              try { data = JSON.parse(text); } catch {}
              if (data && (data.code === 200 || data.code === 0) && typeof data.flow_balance === 'number') {
                break;
              }
            } catch {}
          }
        }
      }
    }

    if (data && (data.code === 200 || data.code === 0) && typeof data.flow_balance === 'number') {
      const flowBytes = data.flow_balance;
      const remainingGb = Number((flowBytes / (1024 ** 3)).toFixed(3));

      let packageGb = Number(proxy711.packageGb) || 0;
      if (packageGb <= 0 || packageGb < remainingGb) {
        packageGb = Math.max(1, Math.ceil(remainingGb));
        proxy711.packageGb = packageGb;
        void saveProxy711Config();
      }

      const usedGb = Math.max(0, Number((packageGb - remainingGb).toFixed(3)));
      const usedPercent = packageGb > 0 ? Math.min(100, Number(((usedGb / packageGb) * 100).toFixed(1))) : 0;
      const remainingPercent = Number(Math.max(0, 100 - usedPercent).toFixed(1));

      cached711Balance = {
        ok: true,
        flow_balance: flowBytes,
        flowFormatted: formatBytes(flowBytes),
        remainingGb,
        remainingFormatted: `${remainingGb.toFixed(2)} GB`,
        packageGb,
        packageFormatted: `${packageGb.toFixed(2)} GB`,
        usedGb,
        usedFormatted: `${usedGb.toFixed(2)} GB`,
        usedPercent,
        remainingPercent,
        lastUpdated: Date.now(),
        error: null,
      };
      return cached711Balance;
    }

    throw new Error(data?.message || data?.error || data?.msg || `Lỗi API 711: ${text.slice(0, 100)}`);
  } catch (err) {
    cached711Balance = {
      ...cached711Balance,
      ok: false,
      error: err.message,
    };
    return cached711Balance;
  }
}

let proxy711BalanceTimer = null;
export function start711BalanceBackgroundPolling(intervalMs = 30_000) {
  if (proxy711BalanceTimer) clearInterval(proxy711BalanceTimer);
  if (proxy711.username && proxy711.passwd) {
    void get711Balance(false);
  }
  proxy711BalanceTimer = setInterval(() => {
    if (proxy711.username && proxy711.passwd) {
      void get711Balance(false);
    }
  }, intervalMs);
}

async function loadProxy711Config() {
  await seedFileIfMissing(proxy711ConfigPath, '711proxy-config.json');
  try {
    const d = JSON.parse(await readFile(proxy711ConfigPath, 'utf8'));
    if (d.username) proxy711.username = d.username;
    if (d.passwd) proxy711.passwd = d.passwd;
    if (d.token) proxy711.token = d.token;
    if (d.tokenExpiry) proxy711.tokenExpiry = Number(d.tokenExpiry);
    if (d.wapiToken) proxy711.wapiToken = d.wapiToken;
    if (d.wapiTokenExpiry) proxy711.wapiTokenExpiry = Number(d.wapiTokenExpiry);
    if (d.packageGb) proxy711.packageGb = Number(d.packageGb);
    if (d.authMode) proxy711.authMode = d.authMode;
    if (d.subuser) proxy711.subuser = d.subuser;
    if (d.subpass) proxy711.subpass = d.subpass;
    if (d.gatewayHost) proxy711.gatewayHost = d.gatewayHost;
    if (d.gatewayPort) proxy711.gatewayPort = Number(d.gatewayPort);
  } catch {}

  // Đọc dự phòng từ Config/Settings/Settings.ini nếu chưa có thông tin
  try {
    const candidatePaths = [
      join(dirname(fileURLToPath(import.meta.url)), 'Config', 'Settings', 'Settings.ini'),
      join(getAutoLeadPCDir(), 'Config', 'Settings', 'Settings.ini'),
    ];
    for (const iniPath of candidatePaths) {
      if (existsSync(iniPath)) {
        const text = readFileSync(iniPath, 'utf8');
        const userM = text.match(/^\s*(?:Username|Proxy711User)\s*=\s*(.+)$/im);
        const passM = text.match(/^\s*(?:Passwd|Password|Proxy711Pass)\s*=\s*(.+)$/im);
        const authM = text.match(/^\s*(?:AuthMode|Proxy711AuthMode)\s*=\s*(.+)$/im);
        const subuserM = text.match(/^\s*(?:Subuser|Proxy711SubUser)\s*=\s*(.+)$/im);
        const subpassM = text.match(/^\s*(?:Subpass|Proxy711SubPass)\s*=\s*(.+)$/im);
        const hostM = text.match(/^\s*(?:GatewayHost|Proxy711GatewayHost)\s*=\s*(.+)$/im);
        const portM = text.match(/^\s*(?:GatewayPort|Proxy711GatewayPort)\s*=\s*(.+)$/im);
        if (userM && !proxy711.username) proxy711.username = userM[1].trim();
        if (passM && !proxy711.passwd) proxy711.passwd = passM[1].trim();
        if (authM && !proxy711.authMode) proxy711.authMode = authM[1].trim();
        if (subuserM && !proxy711.subuser) proxy711.subuser = subuserM[1].trim();
        if (subpassM && !proxy711.subpass) proxy711.subpass = subpassM[1].trim();
        if (hostM && !proxy711.gatewayHost) proxy711.gatewayHost = hostM[1].trim();
        if (portM && !proxy711.gatewayPort) proxy711.gatewayPort = Number(portM[1].trim()) || 10000;
        if (proxy711.username && proxy711.passwd) break;
      }
    }
  } catch {}
}

async function saveProxy711Config() {
  await writeFile(proxy711ConfigPath, JSON.stringify({
    username: proxy711.username,
    passwd: proxy711.passwd || '',
    token: proxy711.token,
    tokenExpiry: proxy711.tokenExpiry,
    wapiToken: proxy711.wapiToken || '',
    wapiTokenExpiry: proxy711.wapiTokenExpiry || 0,
    packageGb: proxy711.packageGb || 0,
    authMode: proxy711.authMode || 'subuser',
    subuser: proxy711.subuser || '',
    subpass: proxy711.subpass || '',
    gatewayHost: proxy711.gatewayHost || 'global.rotgbapi.trustsource.live',
    gatewayPort: proxy711.gatewayPort || 10000,
  })).catch(() => {});

  // Đồng thời lưu vào Config/Settings/Settings.ini (mục [Proxy711] - file này được gitignore hoàn toàn)
  try {
    const candidatePaths = [
      join(dirname(fileURLToPath(import.meta.url)), 'Config', 'Settings', 'Settings.ini'),
      join(getAutoLeadPCDir(), 'Config', 'Settings', 'Settings.ini'),
    ];
    for (const iniPath of candidatePaths) {
      const dir = dirname(iniPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      let text = existsSync(iniPath) ? readFileSync(iniPath, 'utf8') : '';
      const section = `[Proxy711]\nUsername=${proxy711.username}\nPasswd=${proxy711.passwd || ''}\nAuthMode=${proxy711.authMode || 'subuser'}\nSubuser=${proxy711.subuser || ''}\nSubpass=${proxy711.subpass || ''}\nGatewayHost=${proxy711.gatewayHost || 'global.rotgbapi.trustsource.live'}\nGatewayPort=${proxy711.gatewayPort || 10000}\n`;
      if (text.includes('[Proxy711]')) {
        text = text.replace(/\[Proxy711\][\s\S]*?(?=\n\[|$)/, section);
      } else {
        text = text.trim() ? `${text.trim()}\n\n${section}` : section;
      }
      writeFileSync(iniPath, text, 'utf8');
    }
  } catch {}
}

async function ensure711Token() {
  if (proxy711.token && Date.now() < proxy711.tokenExpiry) {
    return proxy711.token;
  }
  if (!proxy711.username || !proxy711.passwd) {
    await loadProxy711Config();
  }
  if (proxy711.username && proxy711.passwd) {
    try {
      return await fetch711Token(proxy711.username, proxy711.passwd);
    } catch {}
  }
  return null;
}

export async function fetch711WapiToken(username, passwd) {
  try {
    const res = await fetch('https://server.711proxy.com/wapi/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, passwd }),
    });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch {}
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

export async function ensure711WapiToken() {
  if (proxy711.wapiToken && Date.now() < (proxy711.wapiTokenExpiry || 0)) {
    return proxy711.wapiToken;
  }
  if (!proxy711.username || !proxy711.passwd) {
    await loadProxy711Config();
  }
  if (proxy711.username && proxy711.passwd) {
    return await fetch711WapiToken(proxy711.username, proxy711.passwd);
  }
  return null;
}

/**
 * Lấy lịch sử tiêu thụ lưu lượng thực tế theo giờ từ API chính thức của 711Proxy (/wapi/consume/chart/).
 *
 * @param {object} [options]
 * @param {number} [options.from] Thời điểm bắt đầu (Unix timestamp, giây)
 * @param {number} [options.to] Thời điểm kết thúc (Unix timestamp, giây)
 * @param {string} [options.subuser] Tên sub-user (tuỳ chọn)
 * @param {number} [options.days=1] Số ngày nếu không truyền from/to
 * @return {Promise<object>} Dữ liệu chi tiết tiêu hao theo giờ
 */
export async function get711ConsumptionChart({ from = null, to = null, subuser = '', days = 1 } = {}) {
  const wapiToken = await ensure711WapiToken();
  if (!wapiToken) {
    throw new Error('Chưa đăng nhập 711proxy hoặc chưa có thông tin tài khoản.');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  let startSec = from ? Number(from) : (nowSec - Math.max(1, Number(days) || 1) * 86400);
  let endSec = to ? Number(to) : nowSec;

  const url = new URL('https://server.711proxy.com/wapi/consume/chart/');
  url.searchParams.set('from', String(startSec));
  url.searchParams.set('to', String(endSec));
  if (subuser) {
    url.searchParams.set('subuser', String(subuser).trim());
  }

  let res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${wapiToken}` },
  });

  if (res.status === 401 || res.status === 403) {
    proxy711.wapiToken = '';
    proxy711.wapiTokenExpiry = 0;
    await saveProxy711Config();
    const freshToken = await ensure711WapiToken();
    if (freshToken) {
      res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${freshToken}` },
      });
    }
  }

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}

  if (!res.ok || (data?.code !== 200 && data?.code !== 0)) {
    throw new Error(data?.message || data?.msg || data?.error || `Lỗi API 711: ${text.slice(0, 120)}`);
  }

  const rawList = Array.isArray(data.results) ? data.results : [];
  let totalBytes = 0;
  let peakBytes = 0;
  let peakHour = null;
  let peakPeriod = null;

  const items = rawList.map((entry) => {
    const bytes = Number(entry.total_traffic_count) || 0;
    totalBytes += bytes;

    let localTime = entry.period;
    if (entry.timestamp) {
      const d = new Date(entry.timestamp * 1000);
      const nextD = new Date((entry.timestamp + 3600) * 1000);
      const pad = (n) => String(n).padStart(2, '0');
      localTime = `${pad(d.getHours())}:00 - ${pad(nextD.getHours())}:00 (${pad(d.getDate())}/${pad(d.getMonth() + 1)})`;
    }

    if (bytes > peakBytes) {
      peakBytes = bytes;
      peakHour = localTime;
      peakPeriod = entry.period;
    }
    const mb = Number((bytes / (1024 ** 2)).toFixed(2));
    const gb = Number((bytes / (1024 ** 3)).toFixed(3));

    return {
      period: entry.period,
      timestamp: entry.timestamp,
      localTime,
      bytes,
      formatted: formatBytes(bytes),
      mb,
      gb,
    };
  });

  for (const item of items) {
    item.percent = totalBytes > 0 ? Number(((item.bytes / totalBytes) * 100).toFixed(1)) : 0;
  }

  items.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return {
    ok: true,
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
    totalGb: Number((totalBytes / (1024 ** 3)).toFixed(3)),
    peakBytes,
    peakFormatted: formatBytes(peakBytes),
    peakHour,
    peakPeriod,
    activeHoursCount: items.filter((i) => i.bytes > 0).length,
    items,
  };
}

export async function add711IpWhitelist(ip, token = null, retry = true) {
  if (!ip) throw new Error('Cần địa chỉ IP để thêm vào whitelist.');
  const curToken = token || await ensure711Token();
  if (!curToken) {
    throw new Error(`Chưa đăng nhập 711proxy. Vui lòng đăng nhập 711proxy trên app để tự động thêm IP ${ip} vào whitelist.`);
  }

  const res = await fetch('https://server.711proxy.com/eapi/whitelist/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${curToken}`,
    },
    body: JSON.stringify({ whitelist: ip, action: 'add' }),
  });

  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}

  if (res.ok && (data?.code === 200 || data?.code === 0 || data?.msg === 'success.')) {
    return { ok: true, ip, data };
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

/**
 * Tạo danh sách proxy 711 định dạng User & Pass Auth (Sub-user).
 *
 * Chế độ này dùng trực tiếp gateway của 711proxy, KHÔNG cần Whitelist IP,
 * chạy được trên bất kỳ máy Mac/PC nào, đổi WiFi/IP không ảnh hưởng.
 * Mỗi proxy được cấp một session sticky riêng biệt trong thời gian định cấu hình.
 *
 * @param {Object} [opts]
 * @param {string} [opts.subuser] Tên tài khoản con (Sub-user)
 * @param {string} [opts.subpass] Mật khẩu tài khoản con
 * @param {number} [opts.count=50] Số lượng proxy cần tạo
 * @param {string} [opts.region='US'] Mã quốc gia (US, GB, CA...) hoặc GLOBAL
 * @param {number} [opts.sessTime=20] Thời gian giữ nguyên IP mỗi session (phút)
 * @param {boolean} [opts.sessAuto=true] Tự động đổi IP mới khi hết giờ phiên
 * @param {string} [opts.gatewayHost='global.rotgbapi.trustsource.live']
 * @param {number} [opts.gatewayPort=10000]
 * @return {string[]} Danh sách URL proxy HTTP đầy đủ thông tin xác thực
 */
export function generate711SubuserProxies({
  subuser = proxy711.subuser,
  subpass = proxy711.subpass,
  count = 50,
  region = 'US',
  sessTime = 20,
  sessAuto = true,
  gatewayHost = proxy711.gatewayHost || 'global.rotgbapi.trustsource.live',
  gatewayPort = proxy711.gatewayPort || 10000,
} = {}) {
  const su = String(subuser || proxy711.subuser || '').trim();
  const sp = String(subpass || proxy711.subpass || '').trim();
  if (!su || !sp) {
    throw new Error('Chưa nhập Sub-user và Sub-password của 711Proxy. Vui lòng tạo tài khoản con trên dashboard 711proxy rồi điền vào app.');
  }

  const cleanHost = String(gatewayHost).trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
  const [hostOnly, portOnly] = cleanHost.split(':');
  const finalHost = hostOnly || 'global.rotgbapi.trustsource.live';
  const finalPort = portOnly ? parseInt(portOnly) : (gatewayPort || 10000);

  const lines = [];
  const safeCount = Math.min(500, Math.max(1, parseInt(count) || 50));
  const cleanRegion = String(region || '').trim().toUpperCase();

  for (let i = 0; i < safeCount; i++) {
    const sessId = Math.random().toString(36).slice(2, 10);
    const regPart = cleanRegion && cleanRegion !== 'GLOBAL' ? `-region-${cleanRegion}` : '';
    const sessPart = sessTime > 0 ? `-session-${sessId}-sessTime-${sessTime}` : '';
    const autoPart = sessAuto ? '-sessAuto-1' : '';
    const userString = `${su}-zone-custom${regPart}${sessPart}${autoPart}`;
    const proxyUrl = `http://${encodeURIComponent(userString)}:${encodeURIComponent(sp)}@${finalHost}:${finalPort}`;
    lines.push(proxyUrl);
  }
  return lines;
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
    let proxyLines = [];
    if (proxy711.authMode === 'subuser' || (proxy711.subuser && proxy711.subpass)) {
      proxyLines = generate711SubuserProxies({
        subuser: proxy711.subuser,
        subpass: proxy711.subpass,
        count: proxy711AutoRefill.count,
        region: proxy711AutoRefill.region,
        sessTime: proxy711AutoRefill.sessTime,
        sessAuto: proxy711AutoRefill.sessAuto,
        gatewayHost: proxy711.gatewayHost,
        gatewayPort: proxy711.gatewayPort,
      });
      const added = importProxyLines(proxyLines, 'http');
      if (added > 0) {
        await saveProxyQueue();
        console.log(`[Proxy711AutoRefill] Đã tự động tạo thêm ${added} proxy (User:Pass Auth).`);
        void tgNotify(`📦 Tự động tạo thêm <b>${added} proxy</b> từ 711proxy (User:Pass Auth, ${proxy711AutoRefill.region}). Hàng đợi: ${proxyQueue.available.length} proxy.`);
        queueAutomaticRefill();
      }
      return;
    }

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
      if (!text.trim() || text.includes('"code"') || text.toLowerCase().includes('whitelist')) throw new Error(text.slice(0, 200));
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
    proxyLines = rawLines.map((l) => {
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

export async function fetch711Token(username, passwd) {
  void fetch711WapiToken(username, passwd).catch(() => {});
  for (const endpoint of [
    'https://server.711proxy.com/eapi/token/',
    'https://server.711proxy.com/wapi/token/',
  ]) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, passwd }),
      });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { continue; }
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
/** Hàng đợi email mẫu: available = chưa dùng, used = đã dùng. */
export const emailQueue = { available: /** @type {string[]} */ ([]), used: /** @type {string[]} */ ([]), rejected: /** @type {string[]} */ ([]) };
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

const port = Number(process.env.AUTOLEADPC_PORT) || 3211;

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
const maxConcurrentProfiles = Math.min(30, Number(process.env.AUTOLEADPC_CONCURRENCY) || 30);

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

const maxAliveBrowsers = Math.max(1, Math.min(30, Math.floor(Number(process.env.AUTOLEADPC_MAX_ALIVE) || 30)));

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
 * Đọc bộ User-Agent PC tương ứng với hệ điều hành của profile đang mở.
 *
 * @param {string} deviceProfile Hệ điều hành đã chọn trong Settings.
 * @return {Promise<string[]>} Các User-Agent hợp lệ, rỗng nếu chưa có cấu hình.
 * @throws {Error} Lỗi đọc file được xem như cấu hình chưa tồn tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
async function readConfiguredUserAgents(deviceProfile) {
  const candidateNames = ({
    windows: ['useragents.txt', 'useragent.txt'],
    macos: ['useragentMac.txt', 'useragent Mac.txt', 'useragentsMac.txt'],
    linux: ['useragentLinux.txt', 'useragent Linux.txt'],
    android: ['useragentAndroid.txt', 'useragent Android.txt'],
    ios: ['useragentIphone.txt', 'useragent Iphone.txt'],
    ipad: ['useragentIpad.txt', 'useragent Ipad.txt'],
  })[deviceProfile] || [];
  const osToken = ({ windows: /Windows NT/, macos: /Macintosh/, linux: /X11; Linux/, android: /Android/, ios: /iPhone/, ipad: /iPad/ })[deviceProfile];
  if (!osToken || candidateNames.length === 0) return [];

  const candidateDirs = [
    join(getAutoLeadPCDir(), 'Config', 'Browser'),
    join(process.cwd(), 'Config', 'Browser'),
    process.cwd(),
  ];

  for (const dir of candidateDirs) {
    for (const name of candidateNames) {
      try {
        const content = await readFile(join(dir, name), 'utf8');
        const lines = content.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith('Mozilla/') && osToken.test(line));
        if (lines.length > 0) return lines;
      } catch {}
    }
  }
  return [];
}

/**
 * Lấy ngẫu nhiên một UA trong file cấu hình và thay số phiên bản Chrome bằng bản engine thật,
 * để UA, Client Hints và engine luôn khớp nhau.
 *
 * @param {string[]} agents UA đã lọc theo hệ điều hành.
 * @param {number} seed Seed của phiên.
 * @return {((version: string) => string)|null} Hàm dựng UA theo phiên bản, null nếu không có UA cấu hình.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-27
 */
export function pickConfiguredUserAgent(agents, seed) {
  if (!agents?.length) return null;
  const picked = agents[Math.abs(seed) % agents.length];
  return (v) => picked.replace(/(Chrome|CriOS)\/[\d.]+/g, `$1/${v}`);
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
  let payload;
  try {
    payload = JSON.stringify(responseBody);
  } catch (stringifyErr) {
    // JSON.stringify nổ (object vòng / BigInt...) → trả thông tin chẩn đoán thay vì im lặng
    // treo request mãi mãi (lỗi trước đây: GET /state không bao giờ trả về khi có log chứa object Playwright).
    try {
      payload = JSON.stringify({
        error: `Không thể serialize response (${stringifyErr.message})`,
        keys: Object.keys(responseBody || {}),
      });
    } catch {
      payload = '{"error":"Không thể serialize response"}';
    }
  }
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(payload);
}

/**
 * Đường dẫn file cấu hình Telegram bot của instance đang chạy.
 *
 * @return {string} Đường dẫn tuyệt đối tới telegram-config.json.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-05
 */
export function getTelegramConfigPath() {
  return join(appDataDirectory, 'telegram-config.json');
}

/**
 * Đọc cấu hình Telegram bot đã lưu (botToken, allowedUserId, notifyChatId).
 *
 * @return {Promise<{botToken: string, allowedUserId: number|null, notifyChatId: number|null}>} Cấu hình đã chuẩn hóa.
 * @throws {Error} Khi file không tồn tại hoặc JSON hỏng (caller tự bắt).
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-05
 */
export async function loadTelegramConfig() {
  const raw = JSON.parse(await readFile(getTelegramConfigPath(), 'utf8'));
  return {
    botToken: String(raw.botToken || '').trim(),
    allowedUserId: Number(raw.allowedUserId) || null,
    notifyChatId: Number(raw.notifyChatId) || null,
  };
}

/**
 * Ghi cấu hình Telegram bot xuống đĩa với quyền 0600 (chỉ user sở hữu đọc được).
 *
 * @param {{botToken: string, allowedUserId: number, notifyChatId?: number|null}} config Cấu hình cần lưu.
 * @return {Promise<void>} Hoàn tất khi file đã ghi xong.
 * @throws {Error} Khi không ghi được file.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-05
 */
export async function saveTelegramConfig(config) {
  await mkdir(appDataDirectory, { recursive: true, mode: 0o700 });
  const payload = {
    botToken: String(config.botToken || '').trim(),
    allowedUserId: Number(config.allowedUserId),
    notifyChatId: config.notifyChatId ? Number(config.notifyChatId) : Number(config.allowedUserId),
  };
  await writeFile(getTelegramConfigPath(), JSON.stringify(payload, null, 2), { mode: 0o600 });
}

/**
 * Gửi 1 tin nhắn thử nghiệm tới Telegram để xác nhận token/chat id hợp lệ.
 *
 * @param {string} [text] Nội dung tin nhắn thử (mặc định: thông báo kiểm tra kết nối).
 * @return {Promise<{ok: boolean, message: string}>} Kết quả gửi.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-05
 */
export async function sendTelegramTestMessage(text = '✅ AutoLeadPC: kết nối Telegram bot thành công!') {
  let config;
  try {
    config = await loadTelegramConfig();
  } catch {
    return { ok: false, message: 'Chưa có cấu hình Telegram. Hãy nhập Bot Token và Chat ID rồi lưu.' };
  }
  if (!config.botToken) return { ok: false, message: 'Thiếu Bot Token.' };
  const chatId = config.notifyChatId || config.allowedUserId;
  if (!chatId) return { ok: false, message: 'Thiếu Chat ID / User ID để gửi tin.' };
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.ok) return { ok: true, message: `Đã gửi tin thử tới chat ${chatId}.` };
    return { ok: false, message: data?.description || `Telegram trả lỗi HTTP ${res.status}.` };
  } catch (error) {
    return { ok: false, message: `Không gọi được Telegram API: ${error.message}` };
  }
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
  attachFullHtmlLoggerToBrowser(browser);
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
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
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
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
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

const autofillRejectedPath = join(appDataDirectory, 'autofill-rejected.json');
let autofillRejectedKeys = new Set();

/** Định danh record bỏ qua các trường email (email do hàng đợi email gán thêm vào record). */
function autofillRecordIdentity(record = {}) {
  const rest = Object.fromEntries(Object.entries(record).filter(([k]) => !/^(email|emailaddress|mail|assignedemail)$/i.test(k)));
  return autofillRecordKey(rest);
}

/** Nạp danh sách record bị form từ chối. */
async function loadAutofillRejected() {
  try {
    const data = JSON.parse(await readFile(autofillRejectedPath, 'utf8'));
    autofillRejectedKeys = new Set(Array.isArray(data.keys) ? data.keys : []);
  } catch { /* file chưa tồn tại */ }
}

/**
 * Đánh dấu record bị form từ chối: bỏ khỏi hàng đợi (cả available lẫn used) để không bao giờ dùng lại.
 *
 * @param {object} record Bản ghi không qua được form.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-28
 */
async function rejectAutofillRecord(record) {
  const id = autofillRecordIdentity(record);
  autofillRejectedKeys.add(id);
  // Sửa tại chỗ (không gán mảng mới): các phiên đang chạy giữ tham chiếu tới autofillQueue.available.
  for (const list of [autofillQueue.available, autofillQueue.used]) {
    for (let i = list.length - 1; i >= 0; i -= 1) if (autofillRecordIdentity(list[i]) === id) list.splice(i, 1);
  }
  await saveAutofillQueue();
  await writeFile(autofillRejectedPath, JSON.stringify({ keys: [...autofillRejectedKeys] })).catch(() => {});
}

let recordRotationCounter = 0;

/**
 * Lấy record riêng cho một tab: rút khỏi hàng đợi "Dữ liệu tự điền" (chuyển sang đã dùng) để mỗi tab/trình duyệt
 * nhận một record khác nhau. Trước đây tab chính luôn lấy recordPool[0] nên mọi trình duyệt điền cùng một người.
 * Khi pool không phải hàng đợi (dữ liệu dán trực tiếp / tái dùng record đã dùng) thì xoay vòng lần lượt.
 *
 * @param {object[]} pool Pool record của phiên.
 * @param {object[]} [fallback=[]] Danh sách dự phòng khi pool rỗng.
 * @return {object} Bản sao record cho tab (rỗng nếu không còn record).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-28
 */
function takeNextRecord(pool, fallback = []) {
  if (pool === autofillQueue.available) {
    const index = pool.findIndex((r) => !autofillRejectedKeys.has(autofillRecordIdentity(r)));
    if (index !== -1) {
      const [record] = pool.splice(index, 1);
      autofillQueue.used.push(record);
      void saveAutofillQueue();
      void markAutofillRecordUsed(record);
      return withoutSessionEmail(record);
    }
  }
  const list = (pool && pool.length > 0) ? pool : fallback;
  if (!list || list.length === 0) return {};
  const record = list[recordRotationCounter % list.length];
  recordRotationCounter += 1;
  return withoutSessionEmail(record);
}

/**
 * Xử lý khi form từ chối email hoặc thông tin khác: cho vào danh sách bị từ chối và cấp dữ liệu mới.
 *
 * @param {object} session Phiên đang chạy.
 * @param {{kind: 'email'|'record', record: object}} info Loại dữ liệu bị từ chối và record hiện tại.
 * @return {Promise<object|null>} `{ email }` hoặc record mới; null nếu hết dữ liệu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-28
 */
async function handleFormRejected(session, { kind, record = {} }) {
  if (kind === 'email') {
    rejectEmail(session.assignedEmail || record.email);
    const next = await takeNextEmail();
    if (!next) return null;
    session.assignedEmail = next;
    return { email: next };
  }
  await rejectAutofillRecord(record);
  const nextIndex = autofillQueue.available.findIndex((r) => !autofillUsedKeys.has(autofillRecordKey(r)) && !autofillRejectedKeys.has(autofillRecordIdentity(r)));
  if (nextIndex === -1) return null;
  const [next] = autofillQueue.available.splice(nextIndex, 1);
  autofillQueue.used.push(next);
  void saveAutofillQueue();
  void markAutofillRecordUsed(next);
  // Bản sao: currentRecord sẽ bị gắn email phiên, không được ghi lên object nằm trong danh sách đã dùng.
  session.currentRecord = safeCloneRecord(next);
  return { ...next };
}

/** Nạp hàng đợi autofill từ file. */
async function loadAutofillQueue() {
  await seedFileIfMissing(autofillQueuePath, 'autofill-queue.json');
  try {
    const data = JSON.parse(await readFile(autofillQueuePath, 'utf8'));
    autofillQueue.available = Array.isArray(data.available) ? data.available : [];
    autofillQueue.used = Array.isArray(data.used) ? data.used : [];
  } catch { /* file chưa tồn tại */ }

  // Tự động nạp từ Config/Info/info.txt hoặc file JSON tải về nếu hàng đợi rỗng
  if (autofillQueue.available.length === 0 && autofillQueue.used.length === 0) {
    const candidateFiles = [
      join(appDataDirectory, 'Config', 'Info', 'info.txt'),
      join(process.cwd(), 'Config', 'Info', 'info.txt'),
      join(homedir(), 'Downloads', 'json_full_da_loai_zipcode_4_ky_tu.json'),
      join(homedir(), 'Downloads', 'du_lieu_chuyen_doi.json'),
    ];
    for (const filePath of candidateFiles) {
      try {
        const raw = await readFile(filePath, 'utf8');
        if (raw && raw.trim()) {
          const parsed = parseAutofillRecords(raw);
          if (parsed && parsed.length > 0) {
            importAutofillRecords(parsed);
            await saveAutofillQueue();
            console.log(`[AutofillQueue] Đã tự động nạp ${parsed.length} bản ghi thông tin từ ${filePath}`);
            break;
          }
        }
      } catch {}
    }
  }
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
      enabled: settings.enableLeadCheck === true,
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
    emailQueue.rejected = Array.isArray(data.rejected) ? data.rejected : [];
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

/**
 * Đọc một lô email (batchSize) từ file nguồn tại vị trí đang nhớ, cộng thêm vào hàng đợi và lưu vị trí mới.
 *
 * @return {Promise<number>} Số email mới đã nạp; 0 khi đã đọc hết file.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-08
 */
export function refillEmailBatchFromSource() {
  // Một lần nạp mỗi lúc: hai lần chạy song song đọc cùng byteOffset sẽ đẩy trùng một lô email vào hàng đợi.
  emailRefillInFlight ??= readNextEmailBatch().finally(() => { emailRefillInFlight = null; });
  return emailRefillInFlight;
}

let emailRefillInFlight = null;

async function readNextEmailBatch() {
  const { emails, newByteOffset } = await readEmailBatchFromSource(
    emailAutoRefill.sourcePath, emailAutoRefill.byteOffset, emailAutoRefill.batchSize
  );
  if (emails.length === 0) return 0;
  emailQueue.available.push(...emails);
  emailAutoRefill.byteOffset = newByteOffset;
  await saveEmailQueue();
  await saveEmailAutoRefillConfig();
  return emails.length;
}

/** Tự động nạp thêm email từ file nguồn khi hàng đợi cạn. Gọi bất đồng bộ, không block. */
export async function autoRefillEmailIfNeeded() {
  if (!emailAutoRefill.enabled || !emailAutoRefill.sourcePath) return;
  if (emailQueue.available.length > 0) return;
  try {
    const added = await refillEmailBatchFromSource();
    if (added === 0) {
      console.log('[EmailAutoRefill] Đã đọc hết file nguồn.');
      return;
    }
    console.log(`[EmailAutoRefill] Đã nạp thêm ${added} email từ file nguồn.`);
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
  return match && isPlausibleGmail(match[0]) ? match[0].toLowerCase() : null;
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
/**
 * Đánh dấu email bị form từ chối: bỏ khỏi hàng đợi và danh sách đã dùng, ghi vào danh sách bị từ chối.
 *
 * @param {string} email Email không qua được form.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-28
 */
/**
 * Chuẩn hoá một dòng trong danh sách email: lấy phần email hợp lệ ở đầu dòng (cho phép "email|pass", "email:pass"),
 * trả null nếu email dính ký tự lạ phía sau (vd "_old", dãy số).
 *
 * @param {string} line Dòng email trong hàng đợi.
 * @return {string|null} Email hợp lệ hoặc null.
 */
export function normalizeQueueEmail(line) {
  const match = /^\s*([^@\s|:;,]+@[^@\s|:;,]+\.[a-z]{2,})\s*(?:[|:;,\s].*)?$/i.exec(String(line ?? ''));
  return match && isPlausibleGmail(match[1]) ? match[1] : null;
}

/**
 * Gmail chỉ cho tên 6–30 ký tự gồm chữ, số, dấu chấm (không tính phần +tag). File nguồn có nhiều dòng rác
 * như "l@gmail.com", "work@gmail.com", "khmai,g@gmail.com", tên dính mã UUID — form báo email không hợp lệ.
 * Domain khác Gmail thì không kiểm tra thêm.
 *
 * @param {string} email Email cần kiểm tra.
 * @return {boolean} False khi là địa chỉ Gmail không thể tồn tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-30
 */
export function isPlausibleGmail(email) {
  const [local = '', domain = ''] = String(email).toLowerCase().split('@');
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return true;
  const name = local.split('+')[0];
  const letters = name.replace(/\./g, '');
  return /^[a-z0-9](?:[a-z0-9.]*[a-z0-9])?$/.test(name) && !name.includes('..') && letters.length >= 6 && letters.length <= 30;
}

export function rejectEmail(email) {
  if (!email) return;
  const key = String(email).toLowerCase();
  emailQueue.available = emailQueue.available.filter((e) => String(e).toLowerCase() !== key);
  emailQueue.used = emailQueue.used.filter((e) => String(e).toLowerCase() !== key);
  if (!emailQueue.rejected.some((e) => String(e).toLowerCase() === key)) emailQueue.rejected.push(email);
  void saveEmailQueue();
}

/**
 * Lấy email cho phiên; khi hàng đợi cạn và đang bật tự nạp thì chờ nạp xong lô mới rồi lấy,
 * thay vì trả null (phiên chạy không có email riêng, rơi về email cũ trong record).
 *
 * @return {Promise<string|null>} Email được gán hoặc null khi thật sự hết.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-08
 */
export async function takeNextEmail() {
  const email = dequeueNextEmail();
  if (email || !emailAutoRefill.enabled || !emailAutoRefill.sourcePath) return email;
  await autoRefillEmailIfNeeded();
  return dequeueNextEmail();
}

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
  // Email form đã từ chối (emailQueue.rejected) không bao giờ được cấp lại, kể cả khi quay vòng danh sách đã dùng.
  const rejected = new Set(emailQueue.rejected.map((e) => String(e).toLowerCase()));
  emailQueue.available = emailQueue.available.filter((e) => !rejected.has(String(e).toLowerCase()));
  if (emailQueue.available.length === 0) {
    void autoRefillEmailIfNeeded();
    return null;
  }
  // Bỏ qua (và đưa vào danh sách bị từ chối) dòng email hỏng trong danh sách, ví dụ "x@gmail.com_old",
  // "x@gmail.com17650076"; dòng "email|mật khẩu" thì chỉ lấy phần email.
  let email = null;
  while (emailQueue.available.length > 0 && !email) {
    const raw = emailQueue.available.shift();
    const cleaned = normalizeQueueEmail(raw);
    if (cleaned) {
      email = cleaned;
    } else {
      console.log(`[EmailQueue] Bỏ email không hợp lệ trong danh sách: ${raw}`);
      if (!emailQueue.rejected.includes(raw)) emailQueue.rejected.push(raw);
    }
  }
  if (!email) {
    void saveEmailQueue();
    void autoRefillEmailIfNeeded();
    return null;
  }
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
 * @param {{layoutTarget?: number, assignedStreamRoles?: number[]}} options Vị trí ô và offer được phân cho mỗi phiên.
 * @return {Promise<{results: string[], warnings: string[]}>} Kết quả proxy thành công/thất bại và cảnh báo.
 * @throws {Error} Khi cấu hình không hợp lệ hoặc sổ proxy không đọc/ghi được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
async function launchRequestedBrowsers(requestBody, { layoutTarget = null, assignedStreamRoles = null } = {}) {
  const body = JSON.parse(requestBody);
  syncDeviceProfilesFromSettings(body);
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
  const useCloakBrowser = Boolean(body.useCloakBrowser ?? body.cloakBrowser);
  // "Chạy trong app" (checkbox cbxRunInApp): true = chạy ngầm thu nhỏ (ScreenView),
  // false = mở cửa sổ Chrome bình thường ra Desktop. Mặc định true giữ hành vi cũ.
  const screenPreviewOnly = Boolean(body.screenPreviewOnly ?? body.runInApp ?? true);

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

  // Queue là nguồn chính — parse available thành proxy objects, dedup theo identity (server + username/session)
  const seenProxyKeys = new Set();
  const availableProxies = proxyQueue.available.map((line) => {
    try { return { ...parseProxyLine(line.trim(), 1, proxyType), _queueLine: line }; }
    catch { return null; }
  }).filter((proxy) => {
    if (!proxy) return false;
    const key = getProxyUniqueKey(proxy);
    if (seenProxyKeys.has(key)) return false;
    seenProxyKeys.add(key);
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
      enableLeadCheck: body.enableLeadCheck === true,
      leadCheckApiUrl: body.leadCheckApiUrl,
      leadCheckCookie: body.leadCheckCookie,
      leadCheckDatas: body.leadCheckDatas,
      leadCheckInterval: body.leadCheckInterval,
      leadCheckMaxAttempts: body.leadCheckMaxAttempts,
      scriptPath, captchaApiKey, completeText, timeLimit, delayStart, delayStop, limitRun: newLimitRun,
      antiFpCanvas: antiFingerprint.canvas, antiFpClientRects: antiFingerprint.clientRects,
      antiFpWebgl: antiFingerprint.webgl, antiFpWebrtc: antiFingerprint.webrtc,
      Windows: Boolean(body.Windows),
      Mac: Boolean(body.Mac),
      Linux: Boolean(body.Linux),
      Android: Boolean(body.Android),
      iPhone: Boolean(body.iPhone),
      iPad: Boolean(body.iPad),
      useCloakBrowser,
      dataSaver: Boolean(body.dataSaver !== false),
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
    if (offerStrategyState.get(offerNumber)?.mode === 'skip') return;
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
          enabled: body.enableLeadCheck === true,
          apiUrl: body.leadCheckApiUrl || DEFAULT_LEAD_CONFIG.apiUrl,
          cookie: body.leadCheckCookie || DEFAULT_LEAD_CONFIG.cookie,
          datas: body.leadCheckDatas || DEFAULT_LEAD_CONFIG.datas,
          intervalSeconds: Number(body.leadCheckInterval) || DEFAULT_LEAD_CONFIG.intervalSeconds,
          maxAttempts: Number(body.leadCheckMaxAttempts) || DEFAULT_LEAD_CONFIG.maxAttempts,
          checkScreen: Number(body.leadCheckScreen) || DEFAULT_LEAD_CONFIG.checkScreen || 4,
          autoCloseNoLead: body.autoCloseNoLead !== false,
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
          screenPreviewOnly,
          useCloakBrowser,
          dataSaver: body.dataSaver !== false,
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
        const pKey = getProxyUniqueKey(proxy);
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
 * Dừng và xóa profile tạm của phiên trình duyệt được quản lý đúng một lần.
 *
 * @param {object} session Phiên AdsPower do app tạo.
 * @return {Promise<void>} Kết quả dừng profile đã được ghi log nếu thất bại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
function requestManagedProfileStop(session) {
  if (!session._profileStopPromise) {
    session._profileStopPromise = (async () => {
      try {
        if (session._stopProfile) await session._stopProfile();
      } catch (error) {
        console.warn(`[AdsPower] Dừng profile ${session.profileId}: ${error.message}`);
      }
      // Giữ lại profile trong AdsPower để tái sử dụng (Profile Pool), không xóa để tránh chạm hạn ngạch daily import
      if (session._forceDeleteProfile && session._deleteProfile) {
        try {
          await session._deleteProfile();
          console.log(`[AdsPower] Đã xóa profile ${session.profileId} (Slot ${session.slot}) theo yêu cầu.`);
        } catch (error) {
          console.warn(`[AdsPower] Không xóa được profile ${session.profileId}: ${error.message}`);
        }
      }
    })();
  }
  return session._profileStopPromise;
}

/**
 * Loại khỏi danh sách phiên AdsPower những kết nối CDP đã đóng.
 *
 * @return {Promise<void>} Hoàn tất sau khi dọn trạng thái phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
async function pruneDeadManagedSessions() {
  for (const s of [...activeBrowsers]) {
    if (s.isManagedProfile && s.profileId && !s._cdpBrowser?.isConnected()) {
      if (s._monitorInterval) {
        clearInterval(s._monitorInterval);
        s._monitorInterval = null;
      }
      s.isClosed = true;
      releaseProxyLock(s.proxy, s.exitIp);
      if (!s.proxy) activeExitIpLocks.delete('Direct');
      activeBrowsers.delete(s);
      void requestManagedProfileStop(s);
      console.log(`[AdsPower] Đã tự dọn session đóng cho profile ${s.profileId} (Slot ${s.slot}).`);
      if (!s.suppressAutoRefill && autoRefill.enabled && !autoRefill.stopRequested) queueAutomaticRefill();
    }
  }
}

/**
 * Kiểm tra IP exit của proxy trước khi cấp profile AdsPower.
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
 * Mở profile AdsPower, xác minh IP rồi gắn luồng Playwright hiện có.
 *
 * @param {object} options ID profile, proxy, slot và dữ liệu tự động hóa của phiên.
 * @return {Promise<object>} Session trình duyệt đã kết nối.
 * @throws {Error} Khi trình duyệt, CDP hoặc IP proxy không khớp.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
async function openAdsPowerBrowser({ tileIndex, slot, profileId, proxy, verifiedExitIp, websiteUrl, offer = 1,
  autofillRecords = [], autoSubmit = true, leadConfig = {}, scriptSteps = null,
  captchaApiKey = '', completeText = '', timeLimit = 0, delayStop = 0, scriptPath = '',
  hideUntilTarget = false, hideUntilLead = false, totalCount = 10, screenPreviewOnly = false,
  deviceProfile = 'windows', browserVersion = '155', antiFingerprint = {}, deleteProfile = null, startProfile, stopProfile,
  offerUrls = [], threadCount = 1, multiTab = true, useCloakBrowser = false, dataSaver = true }) {

  const assignedSlot = slot ?? (tileIndex + 1);
  const screen = await readScreenSize();
  const tile = tileAt(tileIndex ?? (assignedSlot - 1), totalCount || 10, screen);

  const proxyUrl = proxy?.server ?? null;
  const initialExitIp = verifiedExitIp || 'Direct';

  // "Chạy trong app" (checkbox cbxRunInApp): true/Ẩn-tới-target = cửa sổ chạy ngầm ngoài màn hình;
  // false = SunBrowser mở cửa sổ bình thường ra Desktop ngay khi khởi chạy.
  const hideInitialWindow = screenPreviewOnly || hideUntilTarget || hideUntilLead;
  // "Chạy trong app" → headless thật: không có cửa sổ, không có icon trên Dock (ưu tiên hơn ẩn-tới-target/lead).
  // Đổi lại nút "Hiện cửa sổ" và việc tự bung cửa sổ khi có lead không còn tác dụng; xem và thao tác qua Screen View.
  const trueHeadless = Boolean(screenPreviewOnly);

  // AdsPower cấp CDP URL cho profile SunBrowser vừa mở (chạy ẩn ban đầu ngoài màn hình, bấm mới hiện ra Desktop).
  const browserWebSocketUrl = await startProfile({
    headless: trueHeadless,
    launchArgs: hideInitialWindow
      ? ['--window-position=-20000,-20000', '--start-minimized', '--autoplay-policy=user-gesture-required']
      : ['--window-position=40,60', `--window-size=${tile.width},${tile.height + 100}`, '--autoplay-policy=user-gesture-required'],
  });
  if (!browserWebSocketUrl) throw new Error('AdsPower không trả CDP URL.');

  // Kết nối Playwright vào SunBrowser đang chạy qua CDP (timeout 15s).
  const cdpBrowser = await Promise.race([
    chromium.connectOverCDP(browserWebSocketUrl),
    new Promise((_, reject) => setTimeout(() => reject(new Error('CDP connect timeout 15s')), 15000)),
  ]);
  console.log(`[AdsPower] CDP connected. Contexts: ${cdpBrowser.contexts().length}`);
  const context = cdpBrowser.contexts()[0];
  if (!context) {
    await cdpBrowser.close().catch(() => {});
    await stopProfile(profileId).catch(() => {});
    throw new Error('SunBrowser không có profile mặc định để kết nối.');
  }

  let cloakHumanizeApplied = false;
  if (useCloakBrowser) {
    try {
      cloakHumanizeApplied = await applyCloakHumanize(context);
      console.log(cloakHumanizeApplied
        ? `[AdsPower] Đã gắn lớp Humanize của CloakBrowser cho profile ${profileId}`
        : `[AdsPower] Không gắn được lớp Humanize của CloakBrowser cho profile ${profileId}`);
    } catch (err) {
      console.warn(`[AdsPower] Lỗi gắn CloakBrowser Humanize: ${err.message}`);
    }
  }

  // Thu nhỏ và ẩn ngay lập tức qua CDP và AppleScript để đảm bảo không hiện trên màn hình lúc khởi chạy
  let cdpSession = null;
  let cdpWindowId = null;
  try {
    const activePage = context.pages().filter(p => !p.isClosed())[0];
    if (activePage) {
      cdpSession = await context.newCDPSession(activePage);
      const win = await cdpSession.send('Browser.getWindowForTarget');
      cdpWindowId = win.windowId;
      await hideWindowOffscreen(cdpSession, cdpWindowId);
    }
  } catch {}

  const profileKey = DEVICE_PROFILES[deviceProfile] ? deviceProfile : 'windows';

  // Kiểm tra IP ngay trong SunBrowser: proxy của profile phải thật sự áp dụng.
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
    if (!detectedIp) throw new Error('Không xác minh được IP trong trình duyệt.');
    if (proxy && detectedIp !== verifiedExitIp) {
      throw new Error(`Proxy trong trình duyệt ra IP ${detectedIp}, khác IP đã kiểm tra ${verifiedExitIp}.`);
    }
  } catch (error) {
    await cdpBrowser.close().catch(() => {});
    await stopProfile(profileId).catch(() => {});
    if (deleteProfile) await deleteProfile().catch(() => {});
    throw error;
  } finally {
    await ipCheckPage?.close().catch(() => {});
  }

  const osDisplay = ({ windows: 'Windows 10', macos: 'macOS 14', linux: 'Linux', android: 'Android 13', ios: 'iPhone', ipad: 'iPad' })[deviceProfile] || 'Windows 10';
  const osShort = ({ windows: 'Win 10', macos: 'macOS', linux: 'Linux', android: 'Android', ios: 'iPhone', ipad: 'iPad' })[deviceProfile] || 'Win 10';
  const chromeVer = browserVersion ? `Chrome ${browserVersion}` : `Chrome ${cdpBrowser.version().replace(/^Chrome\//i, '')}`;

  const session = {
    browser: context,
    _cdpBrowser: cdpBrowser,
    tileIndex: tileIndex ?? (assignedSlot - 1),
    slot: assignedSlot,
    chromeVersion: chromeVer,
    deviceProfile: osDisplay,
    deviceVersion: osDisplay,
    deviceSummary: useCloakBrowser ? `${osDisplay} · ${chromeVer} · CloakBrowser Humanize` : `${osDisplay} · ${chromeVer} · Anti-Detect Active`,
    useCloakBrowser: Boolean(useCloakBrowser),
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
    browserWebSocketUrl,
    _deleteProfile: deleteProfile,
    isManagedProfile: true,
    isAdsPower: true,
    _stopProfile: () => stopProfile(profileId),
    inAppPreview: Boolean(screenPreviewOnly),
    hideUntilTarget: Boolean(hideUntilTarget),
    hideUntilLead: Boolean(hideUntilLead),
    hasShownWindow: false,
    isWindowVisible: false,
    leadCheckStatus: null,
    leadCheckMessage: null,
    bandwidthBytes: 0,
    bytesSent: 0,
    bytesReceived: 0,
    requestCount: 0,
    bandwidthFormatted: '0 B',
    dataSaver: Boolean(dataSaver),
    updateBadge: (text) => { session.badgeText = text; },
  };
  activeBrowsers.add(session);
  attachBandwidthTracker(context, session);
  if (session.dataSaver !== false) {
    void attachDataSaver(context, session);
  }
  try { if (session.browser) attachFullHtmlLoggerToContext(session.browser); } catch {}
  try { if (session._cdpBrowser) attachFullHtmlLoggerToBrowser(session._cdpBrowser); } catch {}

  const displayIp = detectedIp || initialExitIp;
  const titlePrefix = `[${displayIp}] [S${assignedSlot}|${osShort}|${chromeVer}]`;

  // InitScript chạy ngay khi tài liệu vừa được tạo, áp dụng cho mọi page & frame
  await context.addInitScript(({ prefix, ip, slot, os, chrome }) => {
    try {
      // 1. Luôn ghim [IP] lên đầu document.title để luôn nhìn thấy trên thanh tab
      const applyTitle = () => {
        try {
          let t = document.title || '';
          if (t.startsWith(`[${ip}]`)) return;
          t = t.replace(/^\[.*?\]\s*/g, '').replace(/^\[.*?\]\s*/g, '').trim();
          document.title = `${prefix} ${t || 'Web'}`;
        } catch {}
      };
      applyTitle();
      document.addEventListener('DOMContentLoaded', applyTitle);
      window.addEventListener('load', applyTitle);
      const obs = new MutationObserver(applyTitle);
      const target = document.querySelector('title') || document.head || document.documentElement;
      if (target) {
        obs.observe(target, { subtree: true, characterData: true, childList: true });
      }

      // 2. Thanh thông tin nổi ghim cố định ở mép trên cùng của trang web
      const injectTopBar = () => {
        try {
          if (document.getElementById('__autolead_ip_bar')) return;
          const bar = document.createElement('div');
          bar.id = '__autolead_ip_bar';
          bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:24px;background:rgba(15,23,42,0.94);color:#38bdf8;font-family:system-ui,-apple-system,sans-serif;font-size:11.5px;font-weight:700;display:flex;align-items:center;justify-content:space-between;padding:0 12px;z-index:2147483647;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,0.5);border-bottom:1px solid #0284c7;letter-spacing:0.2px;';
          bar.innerHTML = `
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="background:#0284c7;color:#fff;padding:1px 6px;border-radius:3px;font-size:10px;">SLOT ${slot}</span>
              <span style="color:#22c55e;">🌐 IP: <b style="color:#fff;font-size:12px;">${ip}</b></span>
              <span style="color:#64748b;">|</span>
              <span style="color:#cbd5e1;">💻 ${os}</span>
              <span style="color:#64748b;">|</span>
              <span style="color:#38bdf8;">${chrome}</span>
            </div>
            <div style="color:#f59e0b;font-size:10.5px;">AutoLeadPC AdsPower</div>
          `;
          (document.body || document.documentElement).appendChild(bar);
        } catch {}
      };
      if (document.body) injectTopBar();
      else document.addEventListener('DOMContentLoaded', injectTopBar);
    } catch {}
  }, { prefix: titlePrefix, ip: displayIp, slot: assignedSlot, os: osDisplay, chrome: chromeVer }).catch(() => {});

  const watchAndEnforcePageTitle = (p) => {
    const enforce = async () => {
      try {
        if (!p || p.isClosed()) return;
        await p.evaluate(({ prefix, ip }) => {
          let t = document.title || '';
          if (!t.startsWith(`[${ip}]`)) {
            t = t.replace(/^\[.*?\]\s*/g, '').replace(/^\[.*?\]\s*/g, '').trim();
            document.title = `${prefix} ${t || 'Web'}`;
          }
        }, { prefix: titlePrefix, ip: displayIp }).catch(() => {});
      } catch {}
    };
    p.on('load', enforce);
    p.on('domcontentloaded', enforce);
    void enforce();
  };

  context.on('page', watchAndEnforcePageTitle);
  for (const existingPage of context.pages()) {
    watchAndEnforcePageTitle(existingPage);
  }

  // Gắn thêm lớp stealthInitScript để đảm bảo loại bỏ hoàn toàn dấu vết automation và thêm lớp nhiễu phụ trợ
  try {
    const dp = DEVICE_PROFILES[deviceProfile] || DEVICE_PROFILES.windows;
    const effectiveUa = dp.ua(String(browserVersion || '130'));
    const stealthConfig = buildStealthConfig(dp, antiFingerprint, assignedSlot, effectiveUa);
    await context.addInitScript(stealthInitScript, stealthConfig);

    // Đồng bộ UA, Client Hints (Sec-CH-UA-Platform, Sec-CH-UA-Platform-Version) tận gốc qua CDP cho AdsPower
    const effectiveBuild = { version: String(browserVersion || '130'), channel: 'stable' };
    const brandLists = buildBrandLists(effectiveBuild.version, 'Google Chrome');
    const secChUaHeader = brandLists.brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
    const clientHintHeaders = dp.uaData ? {
      'Sec-CH-UA': secChUaHeader,
      'Sec-CH-UA-Platform': `"${dp.uaData.platform || 'Windows'}"`,
      'Sec-CH-UA-Platform-Version': `"${dp.uaData.platformVersion || (dp.uaData.platform === 'Windows' ? '10.0.0' : '')}"`,
      'Sec-CH-UA-Mobile': dp.isMobile ? '?1' : '?0',
      'Sec-CH-UA-Model': `"${dp.uaData.model || ''}"`,
      'Sec-CH-UA-Arch': `"${dp.uaData.architecture || 'x86'}"`,
      'Sec-CH-UA-Bitness': `"${dp.uaData.bitness || '64'}"`,
      'Sec-CH-UA-WoW64': '?0',
    } : {};
    const nativeOverrides = {
      userAgentOverride: buildUserAgentOverride(dp, effectiveBuild, ['en-US', 'en']),
      hardwareConcurrency: dp.spoof?.hardwareConcurrency || 8,
      deviceProfile: dp,
      timezoneId: null,
      clientHintHeaders,
    };
    const applyOverridesSafely = async (targetPage) => {
      try {
        if (!targetPage.isClosed()) {
          await applyNativeOverrides(context, targetPage, nativeOverrides);
        }
      } catch {}
    };
    context.on('page', (newPage) => {
      void applyOverridesSafely(newPage);
    });
    for (const existing of context.pages()) {
      void applyOverridesSafely(existing);
    }
  } catch (err) {
    console.warn('[AdsPower] Lỗi gắn stealth script:', err.message);
  }

  // Thu nhỏ cửa sổ về chạy ngầm trong app (ScreenView) khi khởi chạy Nếu bật
  // "Chạy trong app" hoặc ẩn tới khi có target/lead. Khi "Chạy trong app" tắt →
  // cửa sổ SunBrowser mở bình thường ra Desktop.
  try {
    const initPage = context.pages()[0] ?? await context.newPage();
    if (!cdpSession && initPage) {
      cdpSession = await context.newCDPSession(initPage);
    }
    if (cdpSession) {
      if (!cdpWindowId) {
        const win = await cdpSession.send('Browser.getWindowForTarget');
        cdpWindowId = win.windowId;
      }
      if (screenPreviewOnly || hideUntilTarget || hideUntilLead) {
        await hideWindowOffscreen(cdpSession, cdpWindowId);
        session.isWindowVisible = false;
        console.log(`[AdsPower] Slot ${assignedSlot}: Chạy ngầm trong app (thu nhỏ cửa sổ Desktop, bấm mới hiện).`);
        session.addBrowserLog?.({ type: 'navigate', detail: 'Chạy ngầm trong app (thu nhỏ cửa sổ Desktop, bấm mới hiện)...' });
      } else {
        session.isWindowVisible = true;
        session.hasShownWindow = true;
        console.log(`[AdsPower] Slot ${assignedSlot}: Mở cửa sổ SunBrowser bình thường ("Chạy trong app" đang tắt).`);
        session.addBrowserLog?.({ type: 'navigate', detail: 'Mở cửa sổ SunBrowser bình thường ("Chạy trong app" tắt)...' });
      }
    }
  } catch (err) {
    console.warn('[AdsPower] Lỗi thu nhỏ cửa sổ ban đầu:', err.message);
  }

  session.showWindow = async (force = false) => {
    if (session.trueHeadless) {
      session.addBrowserLog?.({ type: 'navigate', detail: 'Đang chạy headless (Chạy trong app) nên không có cửa sổ để hiện; xem qua Screen View.' });
      return;
    }
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
        // Đặt cờ hiện trước khi bringToFront, nếu không suppressBringToFrontWhileHidden chặn mất lệnh đưa lên trước.
        session.hasShownWindow = true;
        session.isWindowVisible = true;
        if (activePage) await activePage.bringToFront().catch(() => {});
        console.log(`[AdsPower] Slot ${assignedSlot}: Đã hiển thị cửa sổ trình duyệt ra Desktop.`);
        session.addBrowserLog?.({ type: 'navigate', detail: 'Đã hiển thị cửa sổ trình duyệt ra Desktop.' });
      }
    } catch (err) {
      console.warn('[AdsPower] Lỗi hiển thị cửa sổ:', err.message);
    }
  };

  session.hideWindow = async () => {
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
        await hideWindowOffscreen(cdpSession, cdpWindowId);
        session.isWindowVisible = false;
        console.log(`[AdsPower] Slot ${assignedSlot}: Đã thu nhỏ cửa sổ về chạy ngầm.`);
        session.addBrowserLog?.({ type: 'navigate', detail: 'Đã thu nhỏ cửa sổ về chạy ngầm.' });
      }
    } catch (err) {
      console.warn('[AdsPower] Lỗi thu nhỏ cửa sổ:', err.message);
    }
  };

  const assignedEmail = await takeNextEmail();
  if (assignedEmail) session.assignedEmail = assignedEmail;

  session.runHidden = Boolean(screenPreviewOnly || hideUntilTarget || hideUntilLead);
  session.trueHeadless = trueHeadless;
  suppressBringToFrontWhileHidden(context, session);
  limitOfferTabs(context, session);
  attachBrowserLogger(context, session);
  attachBandwidthTracker(context, session);
  if (session.dataSaver !== false) {
    void attachDataSaver(context, session);
  }
  if (useCloakBrowser) {
    // AdsPower chạy SunBrowser (Chromium thường) — chỉ có lớp Humanize (JS) được gắn,
    // KHÔNG phải nhân Chromium vá C++ của CloakBrowser. Không được ghi "C++ Patched".
    session.addLog({
      type: 'cloakbrowser_active',
      detail: cloakHumanizeApplied
        ? 'Kích hoạt lớp Humanize (mô phỏng chuột/phím) trên SunBrowser của AdsPower.'
        : 'Yêu cầu bật Humanize trên AdsPower nhưng lớp Humanize không gắn được (xem log cảnh báo).',
    });
  }

  const handleSessionClosed = () => {
    if (session._hasCleanedUp) return;
    session._hasCleanedUp = true;
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
    void requestManagedProfileStop(session);
    const sc = screencastSessions.get(assignedSlot);
    if (sc) {
      if (sc.keepaliveTimer) { clearInterval(sc.keepaliveTimer); sc.keepaliveTimer = null; }
      sc.cdpClient.detach().catch(() => {});
      try { sc.sseResponse.end(); } catch {}
      screencastSessions.delete(assignedSlot);
    }
    console.log(`[AdsPower] Profile ${profileId} (Slot ${assignedSlot}) đã đóng.`);
    if (!session.suppressAutoRefill && autoRefill.enabled && !autoRefill.stopRequested) {
      const baseDelay = (autoRefill.sequential || session.closingDueToNoLead) ? 5000 : 0;
      queueAutomaticRefill(baseDelay + delayStop * 1000);
    }
  };

  context.on('close', handleSessionClosed);
  cdpBrowser.on('disconnected', handleSessionClosed);

  // Điều hướng tới URL offer - hỗ trợ đa luồng dạng đa tab
  const pages = context.pages().filter(p => !p.isClosed());
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  session.mainPage = page;
  page._uxOriginTab = true;
  page._tabIndex = 0;
  page._offerNumber = offer;
  // Khai báo trước khi gán record cho tab (trước đây khai báo phía dưới nên dòng này lỗi TDZ).
  const recordPool = autofillQueue.available.length > 0
    ? autofillQueue.available
    : (autofillRecords.length > 0 ? autofillRecords : autofillQueue.used);
  page._assignedRecord = session.currentRecord ? safeCloneRecord(session.currentRecord) : takeNextRecord(recordPool, autofillRecords);

  const tabUrlsToOpen = [];
  if (Array.isArray(offerUrls) && offerUrls.length > 0) {
    tabUrlsToOpen.push(...offerUrls);
  } else if (websiteUrl) {
    tabUrlsToOpen.push(websiteUrl);
  }
  if (multiTab && threadCount > tabUrlsToOpen.length) {
    const baseCount = tabUrlsToOpen.length || 1;
    while (tabUrlsToOpen.length < threadCount) {
      tabUrlsToOpen.push(tabUrlsToOpen[tabUrlsToOpen.length % baseCount] || websiteUrl);
    }
  }

  // Không mở quá MAX_OFFER_TABS tab offer, nếu không limitOfferTabs sẽ đóng ngay các tab vượt mức.
  if (tabUrlsToOpen.length > MAX_OFFER_TABS) tabUrlsToOpen.length = MAX_OFFER_TABS;
  const primaryUrl = tabUrlsToOpen[0] || websiteUrl;
  if (primaryUrl) {
    await Promise.race([
      page.goto(primaryUrl, { timeout: navigationTimeout, waitUntil: 'domcontentloaded' }).catch(() => {}),
      new Promise(r => setTimeout(r, navigationTimeout + 2000)),
    ]);
    const finalNavUrl = typeof page.url === 'function' ? page.url() : '';
    if (isToffersDuplicateOfferUrl(finalNavUrl)) {
      console.log(`[ToffersDup] Slot ${assignedSlot}: URL đích trả về lỗi IP đã click (${finalNavUrl}). Đóng profile và bù slot mới.`);
      session.isClosed = true;
      session.suppressAutoRefill = false;
      await page.close().catch(() => {});
      await context.close().catch(() => {});
      await stopProfile(profileId).catch(() => {});
      if (!autoRefill.stopRequested && autoRefill.enabled) queueAutomaticRefill();
      return null;
    }
    if (session.isWindowVisible) {
      await page.bringToFront().catch(() => {});
    }
  }

  // Mở các tab còn lại trong cùng trình duyệt cho chế độ đa luồng đa tab
  if (tabUrlsToOpen.length > 1) {
    for (let t = 1; t < tabUrlsToOpen.length; t++) {
      const tabUrl = tabUrlsToOpen[t];
      try {
        // Tab gốc app tự mở: đánh dấu trước khi mở để limitOfferTabs không đóng nhầm.
        session._uxOpeningOriginTabs = (session._uxOpeningOriginTabs || 0) + 1;
        const extraPage = await context.newPage().finally(() => { session._uxOpeningOriginTabs -= 1; });
        extraPage._uxOriginTab = true;
        extraPage._tabIndex = t;
        extraPage._uxPlanned = true;
        extraPage._offerNumber = (t % (offerUrls.length || 1)) + 1;
        extraPage._assignedRecord = takeNextRecord(recordPool, autofillRecords); // mỗi tab một record riêng
        extraPage._uxOriginTab = true;
        await applyOverridesSafely(extraPage);
        if (tabUrl) {
          void extraPage.goto(tabUrl, { timeout: navigationTimeout, waitUntil: 'domcontentloaded' }).catch(() => {});
        }
        console.log(`[MultiTab] Slot ${assignedSlot}: Đã mở Tab ${t + 1} cho đa luồng (${tabUrl}).`);
      } catch (tabErr) {
        console.warn(`[MultiTab] Không mở được Tab ${t + 1}:`, tabErr.message);
      }
    }
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
    const timeLimitTimer = setTimeout(() => {
      session.addLog?.({ time: new Date().toISOString(), type: 'time_limit', detail: `Đã chạy ${timeLimit}s; giữ trình duyệt mở khi tác vụ vẫn đang hoạt động.` });
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

  // Lấy từ queue available; nếu cạn thì tái dùng record đã dùng (used) thay vì chạy rỗng
  if (autofillQueue.available.length === 0 && recordPool.length > 0) {
    void session.addLog?.({
      type: 'record_pool_reuse',
      detail: `Hàng đợi record đã cạn (available=0) — tự động tái dùng lại ${recordPool.length} record đã dùng. Bấm "Đặt lại" trong tab Proxy nếu muốn làm mới.`,
    });
  }
  if (websiteUrl) {
    // Lưu flag để /state hiển thị đúng trạng thái check lead của phiên
    session.enableLeadCheck = leadConfig.enabled === true;
    attachAutofill(context, recordPool, new URL(websiteUrl).origin, session, {
      manualOpsRecorder: startManualOpsRecorder(context, session, appDataDirectory, {}),
      offerStrategy: offerStrategyState.get(session.offerNumber ?? session.streamRole ?? 1) ?? null,
      autoSubmit,
      enableLeadCheck: leadConfig.enabled === true,
      leadCheckScreen: leadConfig.checkScreen || 4,
      /**
       * Ghi log autofill cùng tab nguồn để lưu đúng giao diện của luồng hiện tại.
       * @param {object} entry Sự kiện autofill cần ghi.
       * @param {object|null} page Tab Playwright phát sinh sự kiện.
       * @return {void} Ghi sự kiện vào lịch sử phiên.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-10-21
       */
      onLog: (entry, page) => {
        if (session.hideUntilLead && entry && entry.type === 'lead_confirmed') {
          void session.showWindow?.(true);
        }
        session.addBrowserLog?.(entry, page);
      },
      onFormRejected: (sess, info) => handleFormRejected(sess, info),
      onRecordPicked: (record) => {
        // Tab chính đã nhận record riêng (takeNextRecord) trước khi gắn autofill: dùng luôn, không rút thêm record.
        if (session.mainPage?._assignedRecord) { session.currentRecord = session.mainPage._assignedRecord; return; }
        // Giữ nguyên trạng thái chạy ngầm trong app, không tự ý bung cửa sổ Desktop
        if (session.assignedEmail && record) {
          record.email = session.assignedEmail;
          record.emailaddress = session.assignedEmail;
          record.mail = session.assignedEmail;
          record.assignedEmail = session.assignedEmail;
        }
        session.currentRecord = record;
        // Đưa record GỐC (chưa gắn email phiên) vào danh sách đã dùng: trước đây đẩy bản đã gắn email,
        // nên khi tái dùng danh sách đã dùng, phiên khác nhận luôn email của phiên này.
        const idx = autofillQueue.available.findIndex((r) => r === record || autofillRecordIdentity(r) === autofillRecordIdentity(record));
        const original = idx !== -1 ? autofillQueue.available.splice(idx, 1)[0] : null;
        if (original) {
          autofillQueue.used.push(original);
          void saveAutofillQueue();
        }
        void markAutofillRecordUsed(original ?? withoutSessionEmail(record));
      },
      onScreen5Reached: (sess, p) => {
        if (sess?.emailFilled) void startLeadVerification(sess, leadConfig);
      },
      onEmailSubmitted: (sess, p) => {
        if (sess?.emailFilled) void startLeadVerification(sess, leadConfig);
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
      onStuck: (p) => {
        // Tab nào cũng phải chạy! Không chặn p !== session.mainPage
        if (p._aiAssistRunning) return;
        const currentUrl = p.url?.() || '';
        if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.includes('api.ipify.org')) return;
        const now = Date.now();
        if (p._lastAiUrl === currentUrl && (now - (p._lastAiTime || 0) < 4000)) return;
        p._lastAiUrl = currentUrl;
        p._lastAiTime = now;
        const currentRecord = p._assignedRecord ?? session.currentRecord ?? safeCloneRecord(autofillRecords[0]) ?? {};
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
 * Tạo profile AdsPower riêng cho từng luồng rồi khởi chạy SunBrowser.
 *
 * @param {string} requestBody JSON từ giao diện Mac 2.
 * @param {boolean} isAutomaticRefill Giữ mục tiêu và cấu hình gốc khi chỉ bù slot trống.
 * @param {number[]|null} assignedStreamRoles Offer đã được bộ bù slot phân chia.
 * @return {Promise<{results: object[], warnings: string[]}>} Kết quả mở các slot.
 * @throws {Error} Khi thiếu API key hoặc không thể chuẩn bị profile.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
async function launchAdsPowerBrowsers(requestBody, isAutomaticRefill = false, assignedStreamRoles = null) {
  const body = JSON.parse(requestBody);
  const apiToken = await readAdsPowerApiKey();
  if (!apiToken) throw new Error('Nhập AdsPower API key trong Settings > Browser trước khi chạy.');
  const installedAdsPowerKernelVersions = await listInstalledAdsPowerKernelVersions();
  if (!isAutomaticRefill) {
    autoRefill.stopRequested = false;
    autoRefill.enabled = true;
  }
  const concurrency = Math.min(maxAliveBrowsers, parseInt(body.requestedCount ?? body.concurrency) || 1);
  const websiteUrl = body.websiteUrl || '';
  const offerUrls = body.offerUrls || (body.websiteUrl3 || body.websiteUrl4 || body.websiteUrl2 ? [body.websiteUrl, body.websiteUrl2, body.websiteUrl3, body.websiteUrl4].filter(Boolean) : [websiteUrl].filter(Boolean));
  const multiTab = body.multiTab !== false; // Mặc định chạy đa luồng là đa tab trong 1 trình duyệt
  const useCloakBrowser = Boolean(body.useCloakBrowser ?? body.cloakBrowser);

  const screenPreviewOnly = Boolean(body.screenPreviewOnly ?? body.runInApp ?? true); // "Chạy trong app": false = mở cửa sổ thường

  // Lưu mục tiêu của lượt Start; lần bù chỉ mở số slot còn thiếu.
  if (!isAutomaticRefill) {
    autoRefill.settings = { ...body, browserMode: 'AdsPower', screenPreviewOnly, useCloakBrowser };
    autoRefill.targetCount = concurrency;
    void saveAutoRefillSettings();
  }

  // Tự động dọn dẹp các profile tạm mồ côi trước khi mở slot để không chạm hạn mức 12 profile
  const activeProfileIds = new Set([...activeBrowsers].map((s) => s.profileId).filter(Boolean));
  await cleanupOrphanedAdsPowerProfiles(apiToken, activeProfileIds, fetch, 10).catch(() => {});

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
    fonts: Boolean(body.antiFpFonts),
    apiFakeIP: Boolean(body.antiFpApiFakeIP),
  };
  const enabledDeviceProfiles = [
    body.Windows && 'windows',
    body.Mac && 'macos',
    body.Linux && 'linux',
    body.Android && 'android',
    body.iPhone && 'ios',
    body.iPad && 'ipad',
  ].filter(Boolean);
  if (enabledDeviceProfiles.length === 0) enabledDeviceProfiles.push('macos');
  let scriptSteps = null;
  if (scriptPath) { try { scriptSteps = await loadScript(scriptPath); } catch {} }
  const autofillRecords = parseAutofillRecords(body.autofillData);
  if (autofillRecords.length > 0) {
    const added = importAutofillRecords(autofillRecords);
    if (added > 0) await saveAutofillQueue();
  }
  const leadConfig = {
    enabled: body.enableLeadCheck === true,
    apiUrl: body.leadCheckApiUrl || DEFAULT_LEAD_CONFIG.apiUrl,
    cookie: body.leadCheckCookie || DEFAULT_LEAD_CONFIG.cookie,
    datas: body.leadCheckDatas || DEFAULT_LEAD_CONFIG.datas,
    intervalSeconds: Number(body.leadCheckInterval) || DEFAULT_LEAD_CONFIG.intervalSeconds,
    maxAttempts: Number(body.leadCheckMaxAttempts) || DEFAULT_LEAD_CONFIG.maxAttempts,
    checkScreen: Number(body.leadCheckScreen) || DEFAULT_LEAD_CONFIG.checkScreen || 4,
    autoCloseNoLead: body.autoCloseNoLead !== false,
  };
  const hideUntilTarget = Boolean(body.hideUntilTarget ?? body.hideBrowser);
  const hideUntilLead = Boolean(body.hideUntilLead);

  // Dọn dẹp các session cũ đã đóng hoặc zombie trước khi khởi chạy
  await pruneDeadManagedSessions();

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

  const managedWorkers = [];
  const occupiedSlots = new Set([...activeBrowsers].map(s => s.slot || (s.tileIndex + 1)));

  for (let i = 0; i < count; i++) {
    const offerNum = assignedStreamRoles?.[i] ?? ((i % Math.max(1, offerUrls.length)) + 1);
    const slotOfferUrl = offerUrls[offerNum - 1] || websiteUrl;
    if (offerStrategyState.get(offerNum)?.mode === 'skip') {
      warnings.push(`Offer ${offerNum} được cấu hình bỏ qua; không cấp proxy hoặc mở trình duyệt.`);
      continue;
    }
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

    const chosenDeviceProfile = enabledDeviceProfiles[deviceProfileRotationCounter % enabledDeviceProfiles.length];
    deviceProfileRotationCounter += 1;
    managedWorkers.push({
      slot,
      tileIndex,
      assignedProxy,
      actualExitIp,
      slotOfferUrl,
      offerNum,
      deviceProfile: chosenDeviceProfile,
      threadCount: count,
      multiTab,
      offerUrls,
    });
  }

  // Dùng cùng cách lọc phiên bản đang bận và xoay vòng như Chrome thường.
  const occupiedAdsPowerKernelVersions = new Set([...activeBrowsers]
    .filter((session) => session.isAdsPower && !session.isClosed)
    .map((session) => /SunBrowser (\d+)/.exec(session.chromeVersion || '')?.[1])
    .filter(Boolean));
  const availableAdsPowerKernelVersions = selectAdsPowerKernelVersions(
    installedAdsPowerKernelVersions, occupiedAdsPowerKernelVersions, chromeBuildRotationCounter, managedWorkers.length,
  );
  const launchableWorkers = managedWorkers.filter((worker) => {
    worker.browserVersion = availableAdsPowerKernelVersions.shift();
    if (worker.browserVersion) {
      return true;
    }
    warnings.push(`Slot ${worker.slot}: Không còn phiên bản SunBrowser riêng. Hãy cài thêm kernel AdsPower hoặc giảm số slot đồng thời.`);
    releaseProxyLock(worker.assignedProxy, worker.actualExitIp);
    if (worker.actualExitIp === 'Direct') activeExitIpLocks.delete('Direct');
    return false;
  });

  // Khởi chạy song song các profile với giãn cách nhẹ giữa các lần gọi daemon.
  await Promise.all(launchableWorkers.map(async (worker, workerIdx) => {
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
      const profileOptions = {
        slot: worker.slot,
        proxy: worker.assignedProxy,
        exitIp: worker.actualExitIp,
        websiteUrl: worker.slotOfferUrl,
        antiFingerprint,
        deviceProfile: worker.deviceProfile,
        browserVersion: worker.browserVersion,
        resolution: `${DEVICE_PROFILES[worker.deviceProfile]?.screen?.width ?? 1920}x${DEVICE_PROFILES[worker.deviceProfile]?.screen?.height ?? 1080}`,
      };
      const profileId = await getOrCreateAdsPowerProfile(apiToken, buildAdsPowerProfileRequest(profileOptions), activeProfileIds, worker.slot);
      activeProfileIds.add(profileId);
      worker.profileId = profileId;
      const launchedSession = await openAdsPowerBrowser({
        tileIndex: worker.tileIndex,
        slot: worker.slot,
        profileId,
        proxy: worker.assignedProxy,
        verifiedExitIp: worker.actualExitIp,
        websiteUrl: worker.slotOfferUrl,
        offer: worker.offerNum,
        offerUrls: worker.offerUrls || offerUrls,
        threadCount: worker.threadCount || count,
        multiTab: worker.multiTab ?? multiTab,
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
        deviceProfile: worker.deviceProfile,
        browserVersion: worker.browserVersion,
        antiFingerprint,
        deleteProfile: () => deleteAdsPowerProfile(apiToken, profileId),
        startProfile: (opts) => startAdsPowerProfile(apiToken, profileId, opts),
        stopProfile: () => stopAdsPowerProfile(apiToken, profileId),
        totalCount: concurrency,
        screenPreviewOnly,
        useCloakBrowser,
        dataSaver: body.dataSaver !== false,
      });

      results.push({
        status: 'ok',
        slot: worker.slot,
        offer: worker.offerNum,
        mode: 'adspower-sunbrowser',
        profileId: launchedSession.profileId || worker.profileId,
      });
      chromeBuildRotationCounter += 1;
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
      if (worker.profileId) {
        await stopAdsPowerProfile(apiToken, worker.profileId).catch(() => {});
        await deleteAdsPowerProfile(apiToken, worker.profileId).catch((cleanupError) => {
          console.warn(`[Browser] Không xóa được profile ${worker.profileId}: ${cleanupError.message}`);
        });
      }
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
  body.browserMode = 'Chrome';
  delete body.useAdsPower;
  // Lưu cấu hình lần chạy gần nhất riêng (Stop không xoá file này) để /run trên Telegram chạy được ngay,
  // không phải mở app bấm Start lại sau mỗi lần Stop.
  void writeFile(lastLaunchSettingsPath, JSON.stringify({ settings: body, savedAt: new Date().toISOString() }), 'utf8').catch(() => {});
  const activeBeforeLaunch = activeBrowsers.size;
  const result = await launchRequestedBrowsers(requestBody);
  const countParam = (body.requestedCount !== undefined && body.requestedCount !== '')
    ? body.requestedCount
    : body.concurrency;
  const requestedCount = (countParam === undefined || countParam === '')
    ? Math.min(maxAliveBrowsers, selectProxies(body.proxyList, body.proxyType ?? 'socks5', '').length)
    : Number(countParam);

  // Luôn lưu cấu hình tự bù khi người dùng bấm Start (kể cả lượt đầu đang thử hoặc chưa kịp mở cửa sổ nào)
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
    enableLeadCheck: body.enableLeadCheck === true,
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
    Windows: Boolean(body.Windows),
    Mac: Boolean(body.Mac),
    Linux: Boolean(body.Linux),
    Android: Boolean(body.Android),
    iPhone: Boolean(body.iPhone),
    iPad: Boolean(body.iPad),
    hideUntilTarget: Boolean(body.hideUntilTarget ?? body.hideBrowser),
    hideBrowser: Boolean(body.hideUntilTarget ?? body.hideBrowser),
    hideUntilLead: Boolean(body.hideUntilLead),
    runInApp: Boolean(body.screenPreviewOnly ?? body.runInApp ?? true),
    screenPreviewOnly: Boolean(body.screenPreviewOnly ?? body.runInApp ?? true),
    useCloakBrowser: Boolean(body.useCloakBrowser ?? body.cloakBrowser),
    dataSaver: Boolean(body.dataSaver !== false),
  };
  autoRefill.targetCount = Math.min(
    maxAliveBrowsers,
    Math.max(autoRefill.targetCount, activeBeforeLaunch + requestedCount, activeBrowsers.size),
  );
  autoRefill.message = `Tự bù ${autoRefill.enabled ? 'đang bật' : 'đang tắt'}: ${activeBrowsers.size}/${autoRefill.targetCount} trình duyệt.`;
  void saveAutoRefillSettings();
  if (autoRefill.enabled && activeBrowsers.size < autoRefill.targetCount) {
    queueAutomaticRefill(2000);
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

    const result = await launchRequestedBrowsers(JSON.stringify({
      ...activeSettings,
      browserMode: 'Chrome',
      offerUrls: configuredOffers,
      websiteUrl: configuredOffers[0] || activeSettings.websiteUrl,
      websiteUrl2: configuredOffers[1] || activeSettings.websiteUrl2,
      websiteUrl3: configuredOffers[2] || activeSettings.websiteUrl3,
      websiteUrl4: configuredOffers[3] || activeSettings.websiteUrl4,
      requestedCount: localNeeded,
    }), { layoutTarget: seqTarget, assignedStreamRoles });
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
  void pruneDeadManagedSessions().catch(() => {});
  return {
    enabled: autoRefill.enabled,
    sequential: autoRefill.sequential,
    activeCount: activeBrowsers.size,
    targetCount: autoRefill.targetCount,
    message: autoRefill.message,
    bandwidth: getBandwidthSummary(),
    chromeSessions: [...activeBrowsers]
      .filter((session) => !session.isClosed && session.chromeVersion && (session.exitIp || session.isManagedProfile))
      .map((session) => {
        const livePages = session.browser?.pages ? session.browser.pages().filter(p => !p.isClosed()) : [];
        const tabCount = Math.max(1, livePages.length);
        const tabsInfo = livePages.map((p, idx) => ({
          index: idx,
          url: (typeof p.url === 'function' ? p.url() : '') || '',
          aiRunning: Boolean(p._aiAssistRunning || p._aiFormFixing),
          bandwidthBytes: p._bandwidthBytes || 0,
          bandwidthFormatted: formatBytes(p._bandwidthBytes || 0),
          bytesSent: p._bytesSent || 0,
          bytesReceived: p._bytesReceived || 0,
          requestCount: p._requestCount || 0,
        }));
        const anyTabAiRunning = Boolean(session.aiAssistRunning || livePages.some(p => p._aiAssistRunning || p._aiFormFixing));
        const aiRunningCount = livePages.filter(p => p._aiAssistRunning || p._aiFormFixing).length;

        return {
          slot: session.slot ?? (session.tileIndex + 1),
          version: session.chromeVersion,
          deviceProfile: session.deviceProfile ?? 'windows',
          deviceVersion: session.deviceVersion ?? (session.deviceSummary ? session.deviceSummary.split(' · ')[0] : session.deviceProfile),
          deviceSummary: session.deviceSummary ?? null,
          isWindowVisible: Boolean(session.isWindowVisible),
          exitIp: session.exitIp ?? (session.isManagedProfile ? session.chromeVersion : null),
          proxy: session.proxyServer ?? session.proxyKey ?? null,
          assignedEmail: session.assignedEmail ?? null,
          assignedPass: session.assignedPass ?? (session.currentRecord?.pass || session.currentRecord?.password || '******'),
          assignedRecover: session.assignedRecover ?? (session.currentRecord?.recover || session.currentRecord?.recoveryEmail || '--'),
          autofillRecord: session.autofillRecord ?? null,
          autofillFields: session.autofillFields ?? 0,
          autofillActions: session.autofillActions ?? 0,
          autofillError: session.autofillError ?? null,
          completedScreens: session.completedScreens ?? 0,
          currentScreen: session.currentScreen ?? ((session.completedScreens ?? 0) + 1),
          pageJumps: session.pageJumps ?? 0,
          screenReached: session.screenReached ?? session.currentScreen ?? 1,
          leadCheckStatus: session.leadCheckStatus ?? null,
          leadCheckMessage: session.leadCheckMessage ?? null,
          emailFilled: Boolean(session.emailFilled),
          emailScreenSubmitted: Boolean(session.emailScreenSubmitted),
          leadCheckEnabled: session.enableLeadCheck !== false,
          extensions: session.extensions ?? null,
          streamRole: session.streamRole ?? 1,
          streamLabel: session.streamLabel ?? '',
          offerNumber: session.offerNumber ?? session.streamRole ?? 1,
          websiteUrl: session.websiteUrl ?? null,
          bandwidthBytes: session.bandwidthBytes || 0,
          bandwidthFormatted: formatBytes(session.bandwidthBytes || 0),
          bytesSent: session.bytesSent || 0,
          bytesReceived: session.bytesReceived || 0,
          requestCount: session.requestCount || 0,
          tabCount,
          tabs: tabsInfo,
          aiRunning: anyTabAiRunning,
          aiStatus: anyTabAiRunning
            ? (tabCount > 1 ? `Đang phân tích form bằng AI (${aiRunningCount || 1}/${tabCount} tabs)...` : 'Đang phân tích form bằng AI...')
            : (session.autofillFields ? `Đã điền ${session.autofillFields} trường` : 'Sẵn sàng'),
          action: anyTabAiRunning
            ? (tabCount > 1 ? `🤖 AI đang chạy trên ${aiRunningCount || 1}/${tabCount} tabs` : '🤖 AI đang phân tích & điền form')
            : (session.lastActionText || (session.autofillFields ? `Đã điền ${session.autofillFields} ô` : (session.websiteUrl ? 'Đang duyệt' : 'Running'))),
          lastLog: (session.logs && session.logs.length > 0)
            // Ép chỉ giữ các trường chuỗi/số — tránh object Playwright (frame/page) lọt vào gây
            // JSON.stringify nổ → GET /state chết âm thầm.
            ? {
                time: String(session.logs[session.logs.length - 1]?.time || ''),
                type: String(session.logs[session.logs.length - 1]?.type || ''),
                detail: String(session.logs[session.logs.length - 1]?.detail || ''),
              }
            : null,
        };
      })
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
 * Yêu cầu ipinfo qua proxy hoặc mạng trực tiếp và trả thông tin địa chỉ IP bên ngoài.
 *
 * @param {object|null} proxy Cấu hình proxy đã phân tích; null để tra IP trực tiếp.
 * @return {Promise<object>} Thông tin JSON do ipinfo trả về.
 * @throws {Error} Khi proxy không kết nối được hoặc endpoint trả mã lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
function requestProxyIpInfo(proxy = null) {
  let agent;
  if (proxy) {
    const proxyUrl = new URL(proxy.server);
    if (proxy.username) proxyUrl.username = proxy.username;
    if (proxy.password) proxyUrl.password = proxy.password;
    agent = proxyUrl.protocol === 'socks5:'
      ? new SocksProxyAgent(proxyUrl)
      : new HttpsProxyAgent(proxyUrl);
  }

  const fetchJson = (urlStr, timeoutMs = 4000) => new Promise((resolve, reject) => {
    const isHttps = urlStr.startsWith('https:');
    const reqFn = isHttps ? requestHttps : requestHttp;
    const proxyRequest = reqFn(urlStr, { ...(agent ? { agent } : {}), timeout: timeoutMs }, (response) => {
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
    if (session.isManagedProfile && session.profileId) {
      if (session.browser && typeof session.browser.close === 'function') {
        await session.browser.close().catch(() => {});
      }
      await requestManagedProfileStop(session);
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

  // Chỉ đóng những phiên Chrome mà app quản lý.
  await executeFile('pkill', ['-9', '-f', 'chrome-regular-builds']).catch(() => {});
  await executeFile('pkill', ['-9', '-f', 'user-data-dir.*chrome-profiles']).catch(() => {});
  await executeFile('pkill', ['-9', '-f', 'user-data-dir.*AutoLeadPC']).catch(() => {});

  // Pass 2: bắt các browser vừa được add vào activeBrowsers trong lúc pass 1 đang chạy
  await new Promise((r) => setTimeout(r, 800));
  const lateComers = [...activeBrowsers];
  for (const s of lateComers) {
    s.suppressAutoRefill = true;
    s.isClosed = true;
    if (s._monitorInterval) { clearInterval(s._monitorInterval); s._monitorInterval = null; }
    if (s._autofillTimer) { clearInterval(s._autofillTimer); s._autofillTimer = null; }
    await (s.browser ?? s.context)?.close?.().catch(() => {});
    if (s.isManagedProfile && s.profileId) {
      await requestManagedProfileStop(s).catch(() => {});
    }
  }

  activeBrowsers.clear();
  activeProxyLocks.clear();
  activeExitIpLocks.clear();

  const adsPowerToken = await readAdsPowerApiKey().catch(() => null);
  if (adsPowerToken) {
    void cleanupOrphanedAdsPowerProfiles(adsPowerToken, new Set(), fetch, 10).catch(() => {});
  }

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
  // Chrome for Testing được phép dùng trong vòng xoay (xem listInstalledChromeChannels):
  // là binary Chrome chính thức của Google, engine/UA/Sec-CH-UA cùng phiên bản, chỉ
  // khác tên bundle. Chỉ nhận major ≥ 150 để profile mẫu RoboForm chép được sang.
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
    // Kho Chrome for Testing xếp cuối: bổ sung các major còn thiếu cho vòng xoay
    // (máy chỉ giữ được số ít bản stable dạng archive). Chỉ nhận major ≥ 150 vì
    // profile mẫu RoboForm tạo bằng Chrome 150 — build cũ hơn sẽ không được chép RoboForm.
    ...(await listInstalledChromeVersions())
      .filter((build) => build.major >= 150)
      .map((build) => [
        build.version,
        join(build.executablePath, '..', '..', '..'),
        150,
      ]),
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
 * @param {string} [templateProfileDirectory] Thư mục profile mẫu; mặc định dùng profile mẫu của app.
 * @return {Promise<string|null>} Null nếu đã chép, hoặc lý do không chép để hiện trên giao diện.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-14
 */
export async function seedChromeProfileFromTemplate(
  userDataDirectory,
  build,
  templateProfileDirectory = chromeTemplateProfileDirectory,
) {
  try {
    await access(join(userDataDirectory, 'Local State'));
    return 'profile này tạo trước khi có profile mẫu nên không được chép';
  } catch {
    // Profile chưa được Chrome khởi tạo nên có thể nhận dữ liệu mẫu.
  }
  let templateVersion;
  try {
    const metadata = JSON.parse(await readFile(join(templateProfileDirectory, chromeTemplateMetadataName), 'utf8'));
    templateVersion = metadata.chromeVersion;
    await access(join(templateProfileDirectory, 'Local State'));
  } catch {
    return 'chưa có profile mẫu; bấm "Cài RoboForm cho profile mới"';
  }
  try {
    await access(join(templateProfileDirectory, 'Default', 'Extensions', roboFormExtensionId));
  } catch {
    return 'profile mẫu chưa cài RoboForm';
  }
  if (compareChromeVersions(templateVersion, build.version) > 0) {
    return `profile mẫu tạo bằng Chrome ${templateVersion}, mới hơn Chrome ${build.version}`;
  }
  await cp(templateProfileDirectory, userDataDirectory, {
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
  const roots = [
    chromeProfileDirectory,
    chromeProfileCacheDirectory,
    join(baseDataDirectory, 'chrome-profiles'),
    join(homedir(), 'Library', 'Caches', 'AutoLeadPC', 'chrome-profiles'),
  ];
  return roots.some((root) => {
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
      'Profile mới trên mọi phiên bản Chrome do app quản lý (Chrome 150 trở lên) sẽ được chép kèm RoboForm. Profile đã tạo trước đây không thay đổi.',
    ],
    warnings,
  };
}

/**
 * Bắt đầu quy trình kiểm tra lead khi đến/hoàn thành màn đích (mặc định màn 5: DOB/Gender).
 * Gọi API toffers.top kiểm tra IP sock theo chu kỳ cấu hình (mặc định mỗi 30s, tối đa 2 lần).
 * Nếu IP xuất hiện: cho phép autofill tiếp tục các bước sau (Jump Page, Reward, Offerwall).
 * Chỉ đóng Chrome khi API trả dữ liệu hợp lệ nhưng không có lead; giữ Chrome khi dữ liệu có lead chưa khớp IP hoặc API lỗi.
 *
 * @param {object} session Phiên Chrome đang chạy.
 * @param {object} leadConfig Cấu hình API và thời gian chờ.
 * @return {Promise<void>} Hoàn tất quy trình kiểm tra lead.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-21
 */
async function startLeadVerification(session, leadConfig) {
  // Chỉ check lead khi người dùng tick ô "Check Lead" (leadConfig.enabled === true).
  if (session.leadCheckRunning || leadConfig.enabled !== true) return;
  // BẢO VỆ CHẶN CHECK LEAD ẢO: Tuyệt đối không chuyển sang checking khi chưa điền Gmail
  if (!session.emailFilled) {
    const slotNum = session.tileIndex !== undefined ? (session.tileIndex + 1) : (session.slot || 1);
    console.log(`[LeadCheck] Slot ${slotNum}: Ô Gmail/Email chưa được điền hợp lệ (session.emailFilled = false). Bỏ qua kích hoạt chờ kiểm tra lead, tiếp tục làm form.`);
    return;
  }
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

  const intervalSeconds = Math.max(1, Number(leadConfig.intervalSeconds) || DEFAULT_LEAD_CONFIG.intervalSeconds || 30);
  const maxAttempts = Math.max(1, Number(leadConfig.maxAttempts) || DEFAULT_LEAD_CONFIG.maxAttempts || 2);

  const attemptText = maxAttempts > 1 ? `${maxAttempts} lần x ${intervalSeconds}s` : `1 lần ${intervalSeconds}s`;
  session.leadCheckMessage = `Đã nộp ${targetDesc}; bắt đầu chờ kiểm tra lead (${attemptText})...`;
  updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⏳ Chờ lead (${attemptText})...</span>`);

  // Đóng Chrome để phiên tự bù mở slot mới với proxy khác (closingDueToNoLead: không tính là người dùng tự đóng).
  const closeForNewSlot = async (logType, reasonText) => {
    session.closingDueToNoLead = true;
    session.leadCheckMessage = `❌ ${reasonText}. Tự động tắt trình duyệt để đổi sock mới...`;
    updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#ef4444;">❌ ${reasonText}. Tự tắt Chrome...</span>`);
    console.log(`[LeadCheck] ${label}: ❌ ${reasonText}. Tắt trình duyệt và xoay sock.`);
    const logs = browserSessionLogs.get(session);
    if (logs) {
      logs.push({
        time: new Date().toISOString(),
        offer: session.offerNumber ?? session.streamRole ?? 1,
        type: logType,
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
  };

  let leadFound = false;
  let attempt = 0;
  let latestAttemptHadApiError = false;
  let lastApiErrorMessage = '';
  let latestLeadData = null;

  // 2 lần x 30s: Mỗi lượt chờ 30s, gọi API kiểm tra lead (lead về giữa chừng ở các nhịp 10s là tiếp tục ngay)
  const pollIntervalSec = 10;
  for (attempt = 1; attempt <= maxAttempts && !leadFound; attempt++) {
    console.log(`[LeadCheck] ${label}: Bắt đầu lượt kiểm tra lead ${attempt}/${maxAttempts} (${intervalSeconds}s)...`);
    let attemptSecondsLeft = intervalSeconds;

    while (attemptSecondsLeft > 0) {
      if (!activeBrowsers.has(session) || session.browser?.isClosed?.()) {
        return; // Phiên đã bị đóng bởi người dùng
      }

      session.leadCheckMessage = `Đang chờ có lead (lượt ${attempt}/${maxAttempts}), còn ${attemptSecondsLeft}s...`;
      updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⏳ Chờ lead ${attempt}/${maxAttempts} (còn ${attemptSecondsLeft}s)...</span>`);

      const sleepTime = Math.min(attemptSecondsLeft, pollIntervalSec);
      for (let s = sleepTime; s > 0; s--) {
        if (!activeBrowsers.has(session) || session.browser?.isClosed?.()) return;
        const curRemaining = attemptSecondsLeft - (sleepTime - s);
        session.leadCheckMessage = `Đang chờ có lead (lượt ${attempt}/${maxAttempts}), còn ${curRemaining}s...`;
        updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⏳ Chờ lead ${attempt}/${maxAttempts} (còn ${curRemaining}s)...</span>`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      attemptSecondsLeft -= sleepTime;

      // Kiểm tra API ở nhịp 10s hoặc cuối lượt 30s
      try {
        console.log(`[LeadCheck] ${label}: Gọi API kiểm tra lead (lượt ${attempt}/${maxAttempts}, còn ${attemptSecondsLeft}s)...`);
        const leadData = await fetchLeadDatas(leadConfig);
        latestLeadData = leadData;
        latestAttemptHadApiError = false;
        const isPresent = isLeadPresent(leadData, targetIps);

        if (isPresent) {
          leadFound = true;
          console.log(`[LeadCheck] ${label}: ✅ Tìm thấy lead cho IP ${exitIp} ở lượt ${attempt}/${maxAttempts}! Tiếp tục làm tiếp.`);
          break;
        } else {
          console.log(`[LeadCheck] ${label}: ⚠️ Chưa thấy IP ${exitIp} trong dữ liệu lead (lượt ${attempt}/${maxAttempts}, còn ${attemptSecondsLeft}s).`);
        }
      } catch (err) {
        latestAttemptHadApiError = true;
        lastApiErrorMessage = err.message.split('\n')[0];
        console.error(`[LeadCheck] ${label}: ⚠️ Lỗi khi gọi API kiểm tra lead: ${lastApiErrorMessage}`);
        session.leadCheckMessage = `⚠️ Lỗi API toffers.top: ${lastApiErrorMessage}`;
        updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#dc2626;">⚠️ Lỗi API (${err.code || 'ERR'})</span>`);
      }
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
  } else if (latestAttemptHadApiError) {
    session.leadCheckStatus = 'api_error';
    session.screen5LeadVerified = false;
    session.leadCheckMessage = `⚠️ Không xác minh được lead do API lỗi: ${lastApiErrorMessage}. Giữ trình duyệt mở.`;
    updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#dc2626;">⚠️ API lỗi; giữ trình duyệt mở</span>`);
    session.addBrowserLog?.({
      type: 'lead_check_error',
      ip: exitIp,
      detail: `Không xác minh được lead sau ${maxAttempts} lần; API lỗi: ${lastApiErrorMessage}. Giữ trình duyệt mở.`,
    });
    console.warn(`[LeadCheck] ${label}: ${session.leadCheckMessage}`);
  } else if (latestLeadData?.results?.length > 0) {
    const returnedLeadIps = latestLeadData.results
      .slice(0, 5)
      .map((lead) => `ID ${lead.id || '?'} / IP ${normalizeIpAddress(lead.ip) || '?'}`)
      .join('; ');
    session.leadCheckStatus = 'unmatched';
    session.screen5LeadVerified = false;
    const mismatchText = `Có ${latestLeadData.results.length} lead trong API nhưng chưa khớp IP ${exitIp}`;
    session.addBrowserLog?.({
      type: 'lead_ip_mismatch',
      ip: exitIp,
      detail: `${mismatchText}. API check=${latestLeadData.check || '?'}; mẫu kết quả: ${returnedLeadIps || 'không có IP hợp lệ'}.`,
    });
    console.warn(`[LeadCheck] ${label}: ${mismatchText}. API check=${latestLeadData.check || '?'}.`);
    // Lead chưa khớp IP: tắt trình duyệt và bù slot mới (theo yêu cầu, không giữ mở để kiểm tra tay).
    await closeForNewSlot('lead_ip_mismatch_closed', `Lead chưa khớp IP ${exitIp}`);
  } else {
    // Chỉ xoay proxy khi API phản hồi hợp lệ và không trả lead cho dữ liệu đang kiểm tra.
    session.leadCheckStatus = 'failed';
    session.screen5LeadVerified = false;
    const reasonText = `Không có lead về cho IP ${exitIp} sau ${intervalSeconds * maxAttempts}s chờ (${maxAttempts} lần kiểm tra)`;
    if (leadConfig.autoCloseNoLead === false) {
      // Checkbox "tự đóng khi hết lead" bị TẮT: giữ trình duyệt mở, không xoay sock tự động.
      session.leadCheckMessage = `⚠️ ${reasonText}. Giữ trình duyệt mở theo cài đặt (không auto-đóng).`;
      updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⚠️ Không có lead. Giữ Chrome mở...</span>`);
      console.log(`[LeadCheck] ${label}: ⚠️ ${reasonText}. autoCloseNoLead=false → giữ trình duyệt mở.`);
      const logsKeep = browserSessionLogs.get(session);
      if (logsKeep) {
        logsKeep.push({
          time: new Date().toISOString(),
          offer: session.offerNumber ?? session.streamRole ?? 1,
          type: 'lead_failed_keep_open',
          ip: exitIp,
          detail: `${reasonText}. Đã hết 2 lần × 30s check nhưng để trình duyệt mở theo cài đặt checkbox.`,
        });
        queueSaveBrowserLogs();
      }
      return;
    }
    await closeForNewSlot('lead_failed', reasonText);
  }
  } catch (fatalLeadErr) {
    console.error(`[LeadCheck] ${label}: Lỗi nghiêm trọng khi kiểm tra lead:`, fatalLeadErr.message);
    session.leadCheckStatus = 'api_error';
    session.screen5LeadVerified = false;
    session.leadCheckMessage = `⚠️ Lỗi xử lý check lead: ${fatalLeadErr.message}. Giữ trình duyệt mở.`;
    session.updateBadge?.(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#dc2626;">⚠️ Lỗi check lead; giữ trình duyệt mở</span>`);
    session.addBrowserLog?.({ type: 'lead_check_error', ip: exitIp, detail: session.leadCheckMessage });
  } finally {
    session.leadCheckRunning = false;
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
/**
 * Tách profile CloakBrowser khỏi profile Chrome thường theo phiên bản engine thực tế.
 *
 * @param {{channel: string, version: string}} build Bản Chrome được phân bổ cho slot.
 * @param {string} proxyKey Khóa profile gắn với proxy và offer.
 * @param {string|null} cloakVersion Phiên bản engine CloakBrowser, hoặc null khi dùng Chrome thường.
 * @return {string} Đường dẫn profile độc lập với engine còn lại.
 * @throws {never} Hàm chỉ nối các thành phần đường dẫn hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-23
 */
export function browserProfilePath(build, proxyKey, cloakVersion = null) {
  return join(chromeProfileDirectory, cloakVersion !== null ? 'cloakbrowser' : build.channel, cloakVersion ?? build.version, proxyKey);
}

async function openBrowserWithInstalledChrome({
  build, proxy, proxyKey, websiteUrl, usedExitIps, onExitIp, tile, tileIndex, autofillRecords, autoSubmit = true, leadConfig = {}, deviceProfile = 'windows', streamRole = 1, streamLabel = '', offerNumber = 1,
  scriptSteps = null, captchaApiKey = '', completeText = '', timeLimit = 0, delayStop = 0, scriptPath = '',
  antiFingerprint = {}, checkDuplicate = true, hideUntilTarget = false, hideUntilLead = false,
  offerUrls = [], threadCount = 1, multiTab = true, useCloakBrowser = false, screenPreviewOnly = true,
  dataSaver = true,
}) {
  // Chromium không mở an toàn profile đã được Chrome phiên bản mới hơn khởi tạo.
  // CloakBrowser có engine riêng; không dùng chung profile Chrome hay seed từ template Chrome.
  const cloakVersion = useCloakBrowser ? getCloakBrowserStatus().version : null;
  if (useCloakBrowser && !cloakVersion) {
    throw new Error('Không xác định được phiên bản CloakBrowser để tạo profile riêng.');
  }
  const userDataDirectory = browserProfilePath(build, proxyKey, useCloakBrowser ? cloakVersion : null);
  const templateSkipReason = useCloakBrowser
    ? 'CloakBrowser dùng profile riêng, không sao chép profile Chrome khác phiên bản'
    : await seedChromeProfileFromTemplate(userDataDirectory, build);
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
  // CloakBrowser tự đặt --fingerprint-platform theo OS của máy đang chạy (darwin -> macos).
  // Profile thiết bị phải đi theo, nếu không UA/Client Hints nói Windows còn engine lại giả macOS
  // thì navigator.platform, userAgentData.platform và UA tự mâu thuẫn nhau.
  const cloakPlatform = process.platform === 'darwin' ? 'macos' : 'windows';
  const profileKey = useCloakBrowser
    ? cloakPlatform
    : (DEVICE_PROFILES[deviceProfile] ? deviceProfile : 'windows');
  const dp = createDeviceVariant(profileKey, DEVICE_PROFILES[profileKey], sessionSeed, { width: tileViewport.width, height: tileViewport.height + 90 });
  // UA trong tab Useragent (nếu có) thay mẫu cố định. CloakBrowser tự quản UA nên bỏ qua.
  const configuredUa = useCloakBrowser ? null : pickConfiguredUserAgent(await readConfiguredUserAgents(profileKey), sessionSeed);
  if (configuredUa) {
    dp.ua = configuredUa;
    // Android: Client Hints phải cùng model/bản Android với UA, nếu không trang thấy hai thiết bị khác nhau.
    const android = /Android (\d+)[^;)]*; ([^;)]+)\)/.exec(configuredUa(''));
    if (android && dp.uaData) dp.uaData = { ...dp.uaData, platformVersion: `${android[1]}.0.0`, model: android[2].trim() };
    const win = /Windows NT (\d+\.\d+)/.exec(configuredUa(''));
    if (win && dp.uaData) dp.uaData = { ...dp.uaData, platformVersion: `${win[1]}.0`, platform: 'Windows' };
  }
  // Engine CloakBrowser có version riêng (vd 145.x), khác Chrome đã cài (154/155).
  // UA và Client Hints phải theo đúng version engine, nếu không site thấy UA 154 nhưng engine là 145.
  const effectiveBuild = useCloakBrowser
    ? { ...build, version: cloakVersion, channel: 'cloakbrowser' }
    : build;
  const effectiveUa = dp.ua(effectiveBuild.version);
  // Ngôn ngữ khớp quốc gia của IP, cùng nguồn với múi giờ.
  const { locale, languages } = localeForCountry(ipCountry);
  const geolocation = antiFingerprint.apiFakeIP && (ipLat || ipLng)
    ? { latitude: ipLat, longitude: ipLng, accuracy: 20 + Math.floor(Math.random() * 60) }
    : null;
  const effectiveProxyUrl = relay?.proxy?.server || proxy?.server || '';
  const protectWebRtc = Boolean(antiFingerprint?.webrtc);
  const webrtcPolicy = (protectWebRtc || effectiveProxyUrl)
    ? 'disable_non_proxied_udp'
    : 'default';
  const brandLists = buildBrandLists(effectiveBuild.version, 'Google Chrome');
  const secChUaHeader = brandLists.brands.map(b => `"${b.brand}";v="${b.version}"`).join(', ');
  if (dp.uaData) {
    dp.uaData.brands = brandLists.brands;
    dp.uaData.fullVersionList = brandLists.fullVersionList;
  }
  const clientHintHeaders = dp.uaData ? {
    'Sec-CH-UA': secChUaHeader,
    'Sec-CH-UA-Platform': `"${dp.uaData.platform || 'Windows'}"`,
    'Sec-CH-UA-Platform-Version': `"${dp.uaData.platformVersion || (dp.uaData.platform === 'Windows' ? '10.0.0' : '')}"`,
    'Sec-CH-UA-Mobile': dp.isMobile ? '?1' : '?0',
    'Sec-CH-UA-Model': `"${dp.uaData.model || ''}"`,
    'Sec-CH-UA-Arch': `"${dp.uaData.architecture || 'x86'}"`,
    'Sec-CH-UA-Bitness': `"${dp.uaData.bitness || '64'}"`,
    'Sec-CH-UA-WoW64': '?0',
  } : {};

  let context;
  let verifiedExitIp = null;
  // Chạy có cửa sổ hay không: "Chạy trong app" BẬT (hoặc ẩn-tới-target/lead) = headless ẩn hoàn toàn,
  // người dùng xem qua Screen View. TẮT = có cửa sổ Chrome thật hiện ra Desktop.
  const runHeadless = screenPreviewOnly || hideUntilTarget || hideUntilLead;
  // "Chạy trong app" → headless thật: không có cửa sổ, không có icon trên Dock (ưu tiên hơn ẩn-tới-target/lead).
  // Đổi lại nút "Hiện cửa sổ" và việc tự bung cửa sổ khi có lead không còn tác dụng; xem và thao tác qua Screen View.
  const trueHeadless = Boolean(screenPreviewOnly);
  const headlessViewport = dp.viewport ?? tileViewport;
  try {
    if (useCloakBrowser) {
      const cloakVersion = effectiveBuild.version;
      console.log(`[CloakBrowser] Khởi chạy Stealth Chromium ${cloakVersion} (${cloakPlatform}) với profile ${profileKey}, slot ${(tileIndex ?? 0) + 1}`);
      // LƯU Ý: KHÔNG dùng headless thật nữa — headless không tồn tại cửa sổ OS,
      // nút "Hiện cửa sổ" sẽ không bao giờ bung được ra Desktop (bug gốc).
      // Dùng cửa sổ thật + CDP thu nhỏ ngầm ngay khi mở (giống flow AdsPower).
      context = await launchCloakBrowserPersistentContext({
        userDataDir: userDataDirectory,
        headless: trueHeadless,
        viewport: runHeadless ? headlessViewport : null,
        humanize: true,
        userAgent: dp.ua(cloakVersion),
        locale,
        timezoneId,
        timezone: timezoneId,
        proxy: relay?.proxy ?? toPlaywrightProxy(proxy),
        args: [
          // KHÔNG dùng --disable-gpu: CloakBrowser gỡ "--enable-unsafe-swiftshader" khỏi default args
          // (IGNORE_DEFAULT_ARGS) nên nếu còn --disable-gpu thì trang mất hoàn toàn WebGL.
          // Đã đo thực tế: có --disable-gpu -> webgl=false; bỏ đi -> webgl=true.
          // Không truyền "--enable-unsafe-swiftshader": Playwright tự bỏ cờ này khi nằm trong
          // ignoreDefaultArgs, và renderer SwiftShader lại là dấu hiệu fingerprint. Không có --disable-gpu
          // thì WebGL chạy trên GPU thật (ANGLE Metal) — khớp profile macOS và khó phát hiện hơn.
          // Nền tảng do engine quyết định; nêu rõ để không lệch với profile thiết bị đã chọn.
          `--fingerprint-platform=${cloakPlatform}`,
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
          // Chromium tự bật cờ "do automation" khi điều khiển từ xa — tắt đi cho khớp Chrome thật.
          '--disable-blink-features=AutomationControlled',
          // WebRTC policy theo cấu hình anti-fingerprint (nhất quán với UI/engine khác).
          `--webrtc-ip-handling-policy=${webrtcPolicy}`,
          ...(protectWebRtc ? ['--fingerprint-webrtc-ip=auto'] : []),
        ],
        contextOptions: {
          ignoreHTTPSErrors: true,
          extraHTTPHeaders: clientHintHeaders,
          ...(geolocation && { geolocation, permissions: ['geolocation'] }),
          ...(dp.screen && { screen: { width: dp.screen.width, height: dp.screen.height } }),
          ...(runHeadless && { deviceScaleFactor: dp.deviceScaleFactor ?? 1 }),
          isMobile: dp.isMobile,
          hasTouch: dp.hasTouch,
        },
        launchOptions: {
          // CloakBrowser tự đặt ignoreDefaultArgs; Playwright mặc định vẫn thêm --disable-extensions
          // nên extension trong profile mẫu (RoboForm) không bao giờ nạp. Ghi đè danh sách này,
          // giữ lại đúng hai cờ chống lộ automation của CloakBrowser.
          ignoreDefaultArgs: ['--enable-automation', '--enable-unsafe-swiftshader', '--disable-extensions'],
        },
      });
    } else {
      // LƯU Ý: KHÔNG dùng headless thật nữa — headless không có cửa sổ OS để "Hiện cửa sổ" bung ra.
      // Cài giảm runHeadless vẫn mở cửa sổ thật nhưng bị thu nhỏ ngầm ngay khi mở.
      context = await chromium.launchPersistentContext(userDataDirectory, {
        executablePath: build.executablePath,
        ignoreDefaultArgs: ['--enable-automation', '--enable-unsafe-swiftshader', '--disable-extensions', '--disable-background-networking', '--disable-component-update'],
        headless: trueHeadless,
        viewport: runHeadless ? headlessViewport : null,
        ...(dp.screen && { screen: { width: dp.screen.width, height: dp.screen.height } }),
        ignoreHTTPSErrors: true,
        userAgent: dp.ua(build.version),
        locale,
        isMobile: dp.isMobile,
        hasTouch: dp.hasTouch,
        ...(runHeadless && { deviceScaleFactor: dp.deviceScaleFactor ?? 1 }),
        proxy: relay?.proxy ?? toPlaywrightProxy(proxy),
        ...(timezoneId && { timezoneId }),
        // Toạ độ theo IP proxy qua API của Playwright: quyền geolocation và vị trí trả về khớp nhau.
        ...(geolocation && { geolocation, permissions: ['geolocation'] }),
        extraHTTPHeaders: clientHintHeaders,
        args: [
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-blink-features=AutomationControlled',
          `--user-agent=${effectiveUa}`,
          // WebRTC policy theo cấu hình anti-fingerprint (nhất quán với UI/engine khác).
          `--webrtc-ip-handling-policy=${webrtcPolicy}`,
          // KHÔNG dùng --disable-gpu và --enable-unsafe-swiftshader:
          // Tránh lộ card ảo SwiftShader Device (dấu hiệu bot đỏ của Cloudflare/CreepJS).
          // Cho phép WebGL chạy trên GPU thật (ANGLE Metal trên Mac) — khớp 100% profile người dùng thật.
          '--disable-dev-shm-usage',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-ipc-flooding-protection',
          '--disable-breakpad',
          '--disable-component-update',
          '--disable-background-networking',
          '--autoplay-policy=user-gesture-required',
          '--disable-domain-reliability',
          '--js-flags=--max-old-space-size=512',
          '--disk-cache-size=1',
          '--media-cache-size=1',
          '--renderer-process-limit=3',
        ],
      });
    }
  } catch (error) {
    await relay?.close();
    throw error;
  }
  const actualOfferNumber = Number(offerNumber) || Number(streamRole) || 1;
  const session = {
    browser: context,
    tileIndex,
    slot: (tileIndex ?? 0) + 1,
    dataSaver: Boolean(dataSaver),
    chromeVersion: useCloakBrowser ? `CloakBrowser ${effectiveBuild.version}` : build.version,
    // Nhánh CloakBrowser phải lưu profile đã chuẩn hoá (macos/windows) cho khớp engine;
    // nhánh Chrome thường giữ nguyên giá trị thô như trước đây để không đổi hành vi.
    deviceProfile: useCloakBrowser ? profileKey : deviceProfile,
    deviceVersion: dp.deviceVersion || (dp.summary ? dp.summary.split(' · ')[0] : dp.label),
    deviceSummary: useCloakBrowser ? `${dp.summary} · CloakBrowser Stealth` : dp.summary,
    useCloakBrowser: Boolean(useCloakBrowser),
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
    bandwidthBytes: 0,
    bytesSent: 0,
    bytesReceived: 0,
    requestCount: 0,
    bandwidthFormatted: '0 B',
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
  const assignedEmail = await takeNextEmail();
  if (assignedEmail) {
    session.assignedEmail = assignedEmail;
  }
  session.runHidden = runHeadless;
  session.trueHeadless = trueHeadless;
  suppressBringToFrontWhileHidden(context, session);
  limitOfferTabs(context, session);
  attachBrowserLogger(context, session);
  attachBandwidthTracker(context, session);
  if (session.dataSaver !== false) {
    void attachDataSaver(context, session);
  }
  if (useCloakBrowser) {
    session.addLog({
      type: 'cloakbrowser_active',
      detail: `Kích hoạt CloakBrowser Stealth ${effectiveBuild.version} (nhân Chromium vá C++ & Humanize Automation)`,
    });
  }

  // Giả lập thiết bị + chống fingerprint: một script duy nhất chạy trong mọi frame, hàm vá trông như native.
  const stealthConfig = buildStealthConfig(dp, antiFingerprint, sessionSeed, effectiveUa);
  await context.addInitScript(stealthInitScript, stealthConfig);
  // UA, Client Hints, navigator.platform, số nhân CPU, ngôn ngữ: đổi tận gốc qua CDP cho từng tab và iframe khác site.
  const nativeOverrides = {
    userAgentOverride: buildUserAgentOverride(dp, effectiveBuild, languages),
    hardwareConcurrency: dp.spoof.hardwareConcurrency,
    timezoneId,
    deviceProfile: dp,
    clientHintHeaders,
  };
  const overrideTasks = new WeakMap();
  const applyDeviceOverrides = (targetPage) => {
    if (!overrideTasks.has(targetPage)) {
      overrideTasks.set(targetPage, (async () => {
        await applyNativeOverrides(context, targetPage, nativeOverrides)
          .catch((error) => console.warn(`[Stealth] Không áp được override cho tab: ${error.message}`));
        if (antiFingerprint?.workerInjection) {
          await attachGuardedWorkerInjection(context, targetPage, stealthConfig, {
            enabled: true,
            onLog: (entry) => session.addBrowserLog?.(entry, targetPage),
          }).catch(() => {});
        }
      })());
    }
    return overrideTasks.get(targetPage);
  };
  context.on('page', (newPage) => { void applyDeviceOverrides(newPage); });
  await Promise.all(context.pages().map(applyDeviceOverrides));

  // Kiểm tra tính nhất quán profile (coherence) trên tab chính
  const initialPage = context.pages()[0];
  if (initialPage) {
    void verifyPageProfileCoherence(initialPage, dp, antiFingerprint, {
      timezoneId,
      languages,
      onLog: (entry) => session.addBrowserLog?.(entry, initialPage),
    }).catch(() => {});
  }

  // Lấy từ queue available; nếu cạn thì tái dùng record đã dùng (used) thay vì chạy rỗng
  const recordPool = autofillQueue.available.length > 0
    ? autofillQueue.available
    : (autofillRecords.length > 0 ? autofillRecords : autofillQueue.used);
  if (autofillQueue.available.length === 0 && recordPool.length > 0) {
    void session.addLog?.({
      type: 'record_pool_reuse',
      detail: `Hàng đợi record đã cạn (available=0) — tự động tái dùng lại ${recordPool.length} record đã dùng. Bấm "Đặt lại" trong tab Proxy nếu muốn làm mới.`,
    });
  }
  // Lưu flag để /state hiển thị đúng trạng thái check lead của phiên
  session.enableLeadCheck = leadConfig.enabled === true;
  attachAutofill(context, recordPool, new URL(websiteUrl).origin, session, {
      offerStrategy: offerStrategyState.get(session.offerNumber ?? session.streamRole ?? 1) ?? null,
    manualOpsRecorder: startManualOpsRecorder(context, session, appDataDirectory, {}),
    autoSubmit,
    enableLeadCheck: leadConfig.enabled === true,
    leadCheckScreen: leadConfig.checkScreen || 4,
    /**
     * Ghi log autofill cùng tab nguồn để lưu đúng giao diện của luồng hiện tại.
     * @param {object} entry Sự kiện autofill cần ghi.
     * @param {object|null} page Tab Playwright phát sinh sự kiện.
     * @return {void} Ghi sự kiện vào lịch sử phiên.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-10-21
     */
    onLog: (entry, page) => {
      if (session.hideUntilLead && entry && entry.type === 'lead_confirmed') {
        void session.showWindow?.(true);
      }
      session.addBrowserLog?.(entry, page);
    },
    onFormRejected: (sess, info) => handleFormRejected(sess, info),
    onRecordPicked: (record) => {
      // Tab chính đã nhận record riêng (takeNextRecord) trước khi gắn autofill: dùng luôn, không rút thêm record.
      if (session.mainPage?._assignedRecord) { session.currentRecord = session.mainPage._assignedRecord; return; }
      // Không tự ý bung cửa sổ khi điền form
      if (session.assignedEmail && record) {
        record.email = session.assignedEmail;
        record.emailaddress = session.assignedEmail;
        record.mail = session.assignedEmail;
        record.assignedEmail = session.assignedEmail;
      }
      session.currentRecord = record; // lưu để AI assist dùng khi cần
      // Dequeue ngay khi chọn; đưa record GỐC (chưa gắn email phiên) vào danh sách đã dùng.
      const idx = autofillQueue.available.findIndex((r) => r === record || autofillRecordIdentity(r) === autofillRecordIdentity(record));
      const original = idx !== -1 ? autofillQueue.available.splice(idx, 1)[0] : null;
      if (original) {
        autofillQueue.used.push(original);
        void saveAutofillQueue();
      }
      void markAutofillRecordUsed(original ?? withoutSessionEmail(record));
    },
    onScreen5Reached: (sess, page) => {
      if (sess?.emailFilled) void startLeadVerification(sess, leadConfig);
    },
    onEmailSubmitted: (sess, page) => {
      if (sess?.emailFilled) void startLeadVerification(sess, leadConfig);
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
      // Tab nào cũng phải chạy! Không chặn page !== session.mainPage
      if (page._aiAssistRunning) return;

      const currentUrl = page.url?.() || '';
      if (!currentUrl || currentUrl.startsWith('about:') || currentUrl.startsWith('chrome:') || currentUrl.includes('api.ipify.org') || currentUrl.includes('toffers.top/click')) {
        return;
      }
      const now = Date.now();
      // Chống spam AI theo từng tab:
      if (page._lastAiUrl === currentUrl && (now - (page._lastAiTime || 0) < 4000)) {
        return;
      }
      page._lastAiUrl = currentUrl;
      page._lastAiTime = now;

      const currentRecord = page._assignedRecord || session.currentRecord || safeCloneRecord(recordPool[session.recordIndex] ?? recordPool[0]);
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

        const completedAutofillWork = (session.autofillFields ?? 0) + (session.autofillActions ?? 0);
        if (!stillHasWork && isThankYouPage && completedAutofillWork > 0) {
          console.log(`[AI-Assist] Slot ${tileIndex + 1}: đã đạt trang cảm ơn (${session.autofillFields} trường, ${session.autofillActions ?? 0} thao tác), đóng trình duyệt và mở phiên mới.`);
          session.addLog?.({
            time: new Date().toISOString(),
            type: 'ai_completed',
            detail: `AI Assist đã hoàn tất đến trang cảm ơn (${session.autofillFields} trường, ${session.autofillActions ?? 0} thao tác). Đóng trình duyệt và mở phiên mới.`,
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
  try { if (session.browser) attachFullHtmlLoggerToContext(session.browser); } catch {}
  try { if (session._cdpBrowser) attachFullHtmlLoggerToBrowser(session._cdpBrowser); } catch {}

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

    try {
      cdpSession = await context.newCDPSession(page);
      const win = await cdpSession.send('Browser.getWindowForTarget');
      cdpWindowId = win.windowId;
      // Chỉ thu nhỏ (chạy ngầm trong app) khi bật "Chạy trong app" hoặc ẩn tới khi có target/lead.
      // Khi tắt "Chạy trong app" → cửa sổ Chrome mở bình thường ra Desktop.
      if (screenPreviewOnly || hideUntilTarget || hideUntilLead) {
        await hideWindowOffscreen(cdpSession, cdpWindowId);
        session.isWindowVisible = false;
        console.log(`[HideBrowser] Slot ${tileIndex + 1}: Chạy ngầm trong app (thu nhỏ cửa sổ Desktop, bấm mới hiện).`);
        session.addBrowserLog?.({ type: 'navigate', detail: 'Chạy ngầm trong app (thu nhỏ cửa sổ Desktop, bấm mới hiện)...' });
      } else {
        session.isWindowVisible = true;
        session.hasShownWindow = true;
        console.log(`[ShowBrowser] Slot ${tileIndex + 1}: Mở cửa sổ Chrome bình thường ("Chạy trong app" đang tắt).`);
        session.addBrowserLog?.({ type: 'navigate', detail: 'Mở cửa sổ Chrome bình thường ("Chạy trong app" tắt)...' });
      }
    } catch (err) {
      console.warn('[HideBrowser] Lỗi ẩn cửa sổ ban đầu:', err.message);
    }

    session.showWindow = async (force = false) => {
      if (session.trueHeadless) {
        session.addBrowserLog?.({ type: 'navigate', detail: 'Đang chạy headless (Chạy trong app) nên không có cửa sổ để hiện; xem qua Screen View.' });
        return;
      }
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
          session.isWindowVisible = true;
          if (!activePage.isClosed()) await activePage.bringToFront().catch(() => {});
          console.log(`[ShowWindow] Slot ${tileIndex + 1}: Hiển thị cửa sổ trình duyệt ra Desktop.`);
          session.addBrowserLog?.({ type: 'navigate', detail: 'Hiển thị cửa sổ trình duyệt ra Desktop.' });
        }
      } catch (err) {
        console.warn('[ShowWindow] Lỗi hiển thị cửa sổ:', err.message);
      }
    };

    session.hideWindow = async () => {
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
          await hideWindowOffscreen(cdpSession, cdpWindowId);
          session.isWindowVisible = false;
          console.log(`[HideBrowser] Slot ${tileIndex + 1}: Đã thu nhỏ cửa sổ về chạy ngầm.`);
          session.addBrowserLog?.({ type: 'navigate', detail: 'Đã thu nhỏ cửa sổ về chạy ngầm.' });
        }
      } catch (err) {
        console.warn('[HideBrowser] Lỗi thu nhỏ cửa sổ:', err.message);
      }
    };

    const exitIp = await verifyBrowserExitIp(context, usedExitIps, onExitIp, websiteUrl, checkDuplicate);
    verifiedExitIp = exitIp;
    session.exitIp = exitIp;
    session.streamRole = streamRole;
    session.streamLabel = streamLabel;
    session.websiteUrl = websiteUrl;

    const tabUrlsToOpen = [];
    if (Array.isArray(offerUrls) && offerUrls.length > 0) {
      tabUrlsToOpen.push(...offerUrls);
    } else if (websiteUrl) {
      tabUrlsToOpen.push(websiteUrl);
    }
    if (multiTab && threadCount > tabUrlsToOpen.length) {
      const baseCount = tabUrlsToOpen.length || 1;
      while (tabUrlsToOpen.length < threadCount) {
        tabUrlsToOpen.push(tabUrlsToOpen[tabUrlsToOpen.length % baseCount] || websiteUrl);
      }
    }

    // Không mở quá MAX_OFFER_TABS tab offer, nếu không limitOfferTabs sẽ đóng ngay các tab vượt mức.
    if (tabUrlsToOpen.length > MAX_OFFER_TABS) tabUrlsToOpen.length = MAX_OFFER_TABS;
    const primaryUrl = tabUrlsToOpen[0] || websiteUrl;
    const response = await page.goto(primaryUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    const finalUrl = page.url();
    if (!response || response.status() >= 400) {
      throw new Error(`website trả HTTP ${response?.status() ?? 'không có phản hồi'}`);
    }
    const deadReason = await getDeadOrBlockedReason(page);
    if (deadReason) {
      throw new Error(`trang đích hiển thị ${deadReason}`);
    }
    session.mainPage = page;
    page._uxOriginTab = true;
    page._tabIndex = 0;
    page._offerNumber = offerNumber;
    page._assignedRecord = session.currentRecord ? safeCloneRecord(session.currentRecord) : takeNextRecord(recordPool, autofillRecords);

    if (session.isWindowVisible) {
      await page.bringToFront().catch(() => {});
    }

    // Mở các tab còn lại trong cùng trình duyệt cho chế độ đa luồng đa tab
    if (tabUrlsToOpen.length > 1) {
      for (let t = 1; t < tabUrlsToOpen.length; t++) {
        const tabUrl = tabUrlsToOpen[t];
        try {
          // Tab gốc app tự mở: đánh dấu trước khi mở để limitOfferTabs không đóng nhầm.
          session._uxOpeningOriginTabs = (session._uxOpeningOriginTabs || 0) + 1;
          const extraPage = await context.newPage().finally(() => { session._uxOpeningOriginTabs -= 1; });
          extraPage._uxOriginTab = true;
          extraPage._tabIndex = t;
          extraPage._uxPlanned = true;
          extraPage._offerNumber = (t % (offerUrls.length || 1)) + 1;
          extraPage._assignedRecord = takeNextRecord(recordPool, autofillRecords); // mỗi tab một record riêng
          extraPage._uxOriginTab = true;
          await applyDeviceOverrides(extraPage).catch(() => {});
          if (tabUrl) {
            void extraPage.goto(tabUrl, { timeout: navigationTimeout, waitUntil: 'domcontentloaded' }).catch(() => {});
          }
          console.log(`[MultiTab-Chrome] Slot ${(tileIndex ?? 0) + 1}: Đã mở Tab ${t + 1} cho đa luồng (${tabUrl}).`);
        } catch (tabErr) {
          console.warn(`[MultiTab-Chrome] Không mở được Tab ${t + 1}:`, tabErr.message);
        }
      }
    }

    // IP, thiết bị và luồng hiển thị trong giao diện AutoLead; không chèn badge hay sửa tiêu đề trang đích vì script chống bot đọc được.
    context.on('page', (newPage) => {
      // Guard tab popup KHÔNG thuộc luồng (không phải tab đa luồng được biên định):
      // khảo sát/trang quảng cáo hay "nhảy trang" mở tab mới — đóng tab đó
      // và quay về tab đầu tiên để tiếp tục bấm Continue.
      setTimeout(async () => {
        if (newPage.isClosed() || newPage === session.mainPage || newPage._uxOriginTab) return;
        try {
          if (newPage._tabIndex !== undefined || newPage._uxPlanned) return;
          const u = newPage.url();
          if (!u || u.startsWith('about:')) return;
          // Chỉ đóng ngay tab quảng cáo rác. Tab mới khác có thể là chính trang offer (offer mở sang tab mới):
          // trước đây "|| true" đóng mọi tab mới sau 3s nên trang đầu của offer bị tắt. Tab không phải offer
          // do watchTrafficBlockedPage đóng sau khi kiểm tra; số tab tối đa do limitOfferTabs giới hạn.
          // (Trước đây gọi isSpamAdUrl chưa khai báo trong file này → lỗi bị nuốt, guard không chạy.)
          if (/galaxystore\.samsung\.com|play\.google\.com\/store|apps\.apple\.com|popads|propellerads|clickadu|trafficjunky|zeroredirect|doubleclick\.net|syndication\.exoclick/i.test(u)) {
            newPage._uxClosedByApp = 'tab quảng cáo rác';
            console.log(`[PopupTab] Tab quảng cáo ngoài luồng (${u}), đóng và quay về tab đầu.`);
            session.addBrowserLog?.({ type: 'popup_closed', url: u, title: '[Đóng tab nhảy trang]', html: '' });
            await newPage.close().catch(() => {});
          }
          const remaining = context.pages().filter((p) => !p.isClosed());
          const first = remaining[0];
          if (first) await first.bringToFront().catch(() => {});
        } catch {}
      }, 3000);
      newPage.once('load', () => {});
      newPage.once('close', () => {});

      // Guard tab phụ bị lỗi mạng → đóng tab đó thôi, không đóng cả browser
      newPage.on('load', async () => {
        if (newPage.isClosed() || newPage === session.mainPage || newPage._uxOriginTab) return;
        try {
          const deadReason = await getDeadOrBlockedReason(newPage);
          if (!deadReason) return;
          console.log(`[DeadTab] Tab lỗi "${deadReason}" (${newPage.url()}), đóng và giữ trình duyệt.`);
          session.addBrowserLog?.({ type: 'traffic_blocked', detail: `Tab lỗi: ${deadReason}` });
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

    // timeLimit: ghi nhận mốc thời gian; không đóng phiên khi tác vụ vẫn đang hoạt động.
    if (timeLimit > 0) {
      const timeLimitTimer = setTimeout(() => {
        session.addLog?.({ time: new Date().toISOString(), type: 'time_limit', detail: `Đã chạy ${timeLimit}s; giữ trình duyệt mở khi tác vụ vẫn đang hoạt động.` });
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
 * Theo dõi tab cuối để tôn trọng thao tác đóng trình duyệt bằng nút X.
 *
 * @param {object} session Phiên Chrome cần theo dõi các tab.
 * @return {void} Đăng ký theo dõi thao tác đóng tab cuối.
 * @throws {never} Đăng ký callback đóng tab không thực thi thao tác trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
 */
export function closeChromeWhenLastTabCloses(session) {
  const watchedPages = new WeakSet();

  /**
   * Đóng phiên khi tab cuối đã đóng. Chỉ coi là người dùng tự đóng (không bù slot, giảm mục tiêu tự bù)
   * khi cửa sổ đang hiện và tab không do app đóng; còn lại (chạy ngầm/headless không có nút X, trang tự
   * window.close(), app đóng tab không phải offer…) thì tắt trình duyệt và bù slot mới.
   *
   * @param {object} [closedPage] Tab vừa đóng.
   * @return {Promise<void>} Kết thúc sau khi đóng phiên hoặc bỏ qua nếu còn tab.
   * @throws {never} Lỗi khi đóng phiên được xử lý tại callback.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-21
   */
  async function closeEmptyChromeSession(closedPage) {
    if (session.suppressAutoRefill || session.isClosed || session.closingDueToTrafficBlocked || session.closingDueToNoLead || session.leadCheckStatus === 'failed') return;
    try {
      for (const page of session.browser.pages()) {
        if (!page.isClosed()) return;
      }
      // Cửa sổ đang ẩn/headless thì người dùng không bấm X được; tab do app đóng cũng không tính là người dùng đóng.
      // Nếu tab đang bị lỗi mạng trình duyệt (chrome-error): coi là lỗi tự động để bù slot mới.
      const isChromeError = Boolean(
        closedPage?.url?.()?.startsWith('chrome-error://') ||
        session.mainPage?.url?.()?.startsWith('chrome-error://')
      );
      const closedByUser = session.isWindowVisible !== false && !session.trueHeadless && !closedPage?._uxClosedByApp && !isChromeError;
      if (!closedByUser) {
        const reason = closedPage?._uxClosedByApp || (session.isWindowVisible !== false ? 'trang tự đóng (window.close)' : 'trang tự đóng khi đang chạy ngầm');
        console.log(`[LastTab] Slot ${session.slot ?? '?'}: tab cuối bị đóng tự động (${reason}); tắt trình duyệt và bù slot mới.`);
        session.addBrowserLog?.({ type: 'last_tab_closed_auto', detail: `Tab cuối bị đóng tự động (${reason}); tắt trình duyệt và bù slot mới.` });
        session.suppressAutoRefill = false;
        await session.browser.close().catch(() => {});
        return;
      }
      session.suppressAutoRefill = true;
      session.addBrowserLog?.({ type: 'manual_browser_closed', detail: 'Tab cuối đã đóng; không tự mở lại trình duyệt.' });
      if (autoRefill.enabled && !autoRefill.stopRequested && autoRefill.targetCount > 0) {
        autoRefill.targetCount -= 1;
        if (autoRefill.targetCount === 0) {
          autoRefill.enabled = false;
          autoRefill.settings = null;
          autoRefill.queued = false;
          void writeFile(autoRefillSettingsPath, '{}', 'utf8').catch(() => {});
        } else {
          void saveAutoRefillSettings();
        }
      }
      await session.browser.close().catch(() => {});
    } catch {
      // Khi trình duyệt đã mất kết nối, browser close/disconnect handlers xử lý phiên.
    }
  }

  /**
   * Theo dõi tab mới để cả tab mở sau cũng được tính khi đóng phiên.
   *
   * @param {object} page Tab Chrome vừa được mở.
   * @return {void} Gắn sự kiện đóng cho tab chưa theo dõi.
   * @throws {never} Chỉ đăng ký sự kiện trên tab còn hoạt động.
   * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
   * @since 2026-10-20
   */
  function watchTab(page) {
    if (watchedPages.has(page)) return;
    watchedPages.add(page);
    page.on('close', () => closeEmptyChromeSession(page));
  }

  session.browser.on('page', watchTab);
  for (const page of session.browser.pages()) watchTab(page);
}

/**
 * Ghi lại thao tác và lưu mã HTML cùng ảnh chụp cho các giao diện AutoLead quan sát.
 * Log, HTML và ảnh được giữ đầy đủ cho đến khi người dùng chủ động xóa.
 *
 * @param {object} context Playwright BrowserContext.
 * @param {object} session Phiên Chrome hiện tại.
 * @return {void} Cài bộ ghi nhận sự kiện cho phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-21
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

  browserSessionLogs.set(session, sessionItem.logs);
  const snapshotTimers = new Map();
  const lastSnapshotHashes = new WeakMap();
  const snapshotLogTypes = new Set([
    'field_filled',
    'checkbox_checked',
    'survey_answered',
    'survey_solver_answered',
    'submit_clicked',
    'screen_advanced',
    'ai_action',
    'ai_smart_fallback',
    'lead_confirmed',
  ]);

  /**
   * Lưu mã HTML và ảnh màn hình hiện tại nếu giao diện đã thay đổi kể từ lần chụp trước.
   *
   * @param {object} page Tab Playwright cần lưu giao diện.
   * @param {string} captureReason Sự kiện khiến giao diện được lưu.
   * @return {Promise<object|null>} Đường dẫn tệp đã lưu hoặc null nếu tab không hợp lệ.
   * @throws {Error} Khi Playwright không thể chụp ảnh hoặc ghi tệp.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-21
   */
  async function capturePageInterfaceSnapshot(page, captureReason) {
    if (!page || page.isClosed()) return null;
    const url = page.url();
    if (!/^https?:\/\//i.test(url)) return null;

    let html = '';
    let title = '';
    let screenshot = null;
    try {
      [html, title, screenshot] = await Promise.all([
        page.content(),
        page.title().catch(() => ''),
        page.screenshot({ type: 'jpeg', quality: 75, timeout: 7000 }),
      ]);
    } catch {
      return null;
    }
    if (!html || !screenshot) return null;

    const signature = createHash('sha256')
      .update(url)
      .update('\0')
      .update(html)
      .update(screenshot)
      .digest('hex');
    if (lastSnapshotHashes.get(page) === signature) return null;

    const offerNumber = page._offerNumber ?? session.offerNumber ?? session.streamRole ?? 1;
    const offerSubDir = join(interactionHtmlDirectory, `offer-${offerNumber}`);
    await mkdir(offerSubDir, { recursive: true });
    const safeHost = new URL(url).hostname.replace(/[^a-z0-9.-]/gi, '_') || 'page';
    const capturedAt = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 23);
    const pageTabNumber = Number.isInteger(page._tabIndex)
      ? page._tabIndex + 1
      : Math.max(1, context.pages().indexOf(page) + 1);
    const filePrefix = `offer${offerNumber}_${capturedAt}_slot${session.tileIndex + 1}_tab${pageTabNumber}_${safeHost}_${signature.slice(0, 12)}`;
    const htmlFilename = `${filePrefix}.html`;
    const screenshotFilename = `${filePrefix}.jpg`;
    const htmlPath = join(offerSubDir, htmlFilename);
    const screenshotPath = join(offerSubDir, screenshotFilename);

    await Promise.all([
      writeFile(htmlPath, html, 'utf8'),
      writeFile(screenshotPath, screenshot),
    ]);
    lastSnapshotHashes.set(page, signature);
    return {
      url,
      title,
      reason: captureReason,
      htmlPath,
      htmlFilename,
      screenshotPath,
      screenshotFilename,
    };
  }

  /**
   * Gộp các thay đổi giao diện sát nhau thành một lần chụp sau khi trang ổn định.
   *
   * @param {object} page Tab Playwright cần chụp sau thời gian chờ ngắn.
   * @param {string} captureReason Sự kiện gần nhất làm thay đổi giao diện.
   * @return {void} Đặt lịch lưu ảnh và HTML của tab.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-21
   */
  function schedulePageInterfaceSnapshot(page, captureReason) {
    if (!page || page.isClosed()) return;
    const previousTimer = snapshotTimers.get(page);
    if (previousTimer) clearTimeout(previousTimer);
    const timer = setTimeout(() => {
      snapshotTimers.delete(page);
      void capturePageInterfaceSnapshot(page, captureReason).catch((error) => {
        console.warn('[BrowserLogs] Không lưu được giao diện:', error.message);
      });
    }, 650);
    snapshotTimers.set(page, timer);
  }

  /**
   * Ghi một sự kiện thao tác và lên lịch lưu giao diện liên quan khi cần.
   *
   * @param {object} entry Nội dung sự kiện trình duyệt.
   * @param {object|null} eventPage Tab phát sinh sự kiện, nếu sự kiện thuộc autofill.
   * @return {void} Lưu log trong bộ nhớ và xếp lịch ghi đĩa.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-21
   */
  function addLog(entry, eventPage = null) {
    sessionItem.ip = session.exitIp ?? sessionItem.ip;
    if (session.offerNumber) sessionItem.offer = session.offerNumber;
    if (session.websiteUrl) sessionItem.offerUrl = session.websiteUrl;
    const logItem = {
      time: new Date().toISOString(),
      offer: session.offerNumber ?? session.streamRole ?? 1,
      ...entry,
    };
    sessionItem.logs.push(logItem);
    if (snapshotLogTypes.has(logItem.type)) {
      try {
        const snapshotPage = eventPage && !eventPage.isClosed()
          ? eventPage
          : (session.mainPage && !session.mainPage.isClosed()
            ? session.mainPage
            : context.pages().find((page) => !page.isClosed()));
        if (snapshotPage) schedulePageInterfaceSnapshot(snapshotPage, logItem.type);
      } catch {}
    }
    queueSaveBrowserLogs();
  }
  session.addBrowserLog = addLog;
  session.addLog = addLog;
  session.logs = sessionItem.logs;

  // Click tay được ghi ở bộ điều khiển Screen View; không tiêm listener hay hàm toàn cục vào trang.

  /**
   * Theo dõi tab mới, điều hướng và trạng thái tải để lưu mọi giao diện đã quan sát.
   *
   * @param {object} page Tab Playwright cần theo dõi.
   * @return {void} Đăng ký các sự kiện vòng đời của tab.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-10-21
   */
  function hookPage(page) {
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return;
      const url = frame.url();
      if (!url || url === 'about:blank' || url.startsWith('chrome:')) return;
      await new Promise((resolve) => setTimeout(resolve, 400));
      const snapshot = await capturePageInterfaceSnapshot(page, 'navigate').catch(() => null);

      addLog({
        type: 'navigate',
        url,
        title: snapshot?.title || '',
        snapshotReason: snapshot?.reason || 'navigate',
        htmlPath: snapshot?.htmlPath || null,
        htmlFilename: snapshot?.htmlFilename || null,
        screenshotPath: snapshot?.screenshotPath || null,
        screenshotFilename: snapshot?.screenshotFilename || null,
      });
    });

    page.on('domcontentloaded', () => schedulePageInterfaceSnapshot(page, 'domcontentloaded'));
    page.on('load', () => schedulePageInterfaceSnapshot(page, 'load'));
    page.on('close', () => {
      const timer = snapshotTimers.get(page);
      if (timer) clearTimeout(timer);
      snapshotTimers.delete(page);
    });
  }

  context.on('page', hookPage);
  for (const page of context.pages()) hookPage(page);

  context.on('close', () => {
    queueSaveBrowserLogs();
  });
}

/**
 * Kiểm tra xem URL có phải là trang thông báo lỗi trùng IP / đã click offer của toffers.top hay không.
 * Ví dụ: https://toffers.top/error.php?error=ip_74.124.177.158_clicked_offer_2672
 *
 * @param {string} url Địa chỉ trang cần kiểm tra.
 * @return {boolean} True nếu là trang lỗi đã click offer.
 */
export function isToffersDuplicateOfferUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /toffers\.top\/error\.php/i.test(url)
    || /error\.php\?.*error=.*ip_/i.test(url)
    || /error\.php\?error=ip_/i.test(url)
    || /clicked_offer_/i.test(url)
    || /ip_[\d\.]+_clicked_offer/i.test(url);
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
    if (typeof currentUrl === 'string') {
      if (currentUrl.startsWith('chrome-error://') || currentUrl.startsWith('about:neterror')) {
        return 'Lỗi mạng trình duyệt (chrome-error)';
      }
      if (isToffersDuplicateOfferUrl(currentUrl)) {
        return 'IP đã click offer trước đó (Toffers Duplicate IP)';
      }
    }

    const checkFrame = async (frame) => {
      try {
        if (!frame) return null;
        const frameUrl = typeof frame.url === 'function' ? frame.url() : (frame.url || '');
        if (typeof frameUrl === 'string') {
          if (frameUrl.startsWith('chrome-error://') || frameUrl.startsWith('about:neterror')) {
            let frameErr = '';
            try {
              frameErr = typeof frame.evaluate === 'function' ? await frame.evaluate(() => {
                const el = document.getElementById('sub-frame-error-details') || document.getElementById('main-frame-error-details') || document.getElementById('sub-frame-error') || document.getElementById('main-frame-error');
                return el ? (el.innerText || el.textContent || '').trim() : '';
              }) : '';
            } catch {}
            return frameErr ? `Lỗi kết nối (${frameErr})` : 'Lỗi mạng trình duyệt (chrome-error)';
          }
          if (isToffersDuplicateOfferUrl(frameUrl)) {
            return 'IP đã click offer trước đó (Toffers Duplicate IP)';
          }
        }

        if (typeof frame.evaluate !== 'function') return null;

        const evaluatePromise = frame.evaluate(() => {
          const winUrl = (typeof window !== 'undefined' && window.location?.href) || '';
          if (winUrl && (/toffers\.top\/error\.php/i.test(winUrl) || /error\.php\?error=ip_/i.test(winUrl) || /clicked_offer_/i.test(winUrl))) {
            return 'IP đã click offer trước đó (Toffers Duplicate IP)';
          }

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

          if (/clicked_offer_|already clicked offer|ip_[\d\.]+_clicked_offer/i.test(fullText)) {
            return 'IP đã click offer trước đó (Toffers Duplicate IP)';
          }

          if (/traffic\s+blocked/i.test(fullText)) {
            return 'Traffic Blocked!';
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
 * Thời gian chờ (ms) trước khi coi tab chính là "không phải trang offer".
 * Trang trắng/lỗi HTTP chờ ngắn; trang không có form chờ lâu hơn vì form có thể tải chậm.
 */
/** Khoảng gọi API kiểm tra lead trong lúc chờ (giây); tổng thời gian chờ vẫn theo cấu hình. */
export const LEAD_POLL_SECONDS = 10;

export const NON_OFFER_WAIT_MS = { blank: 20000, httpError: 10000, noForm: 30000 };

/**
 * Phiên đã nhận offer và đang làm (điền ô, trả lời câu hỏi, qua màn, check lead): không được tự đóng trình duyệt.
 *
 * @param {object} session Phiên đang chạy.
 * @return {boolean} True nếu phiên đã có tiến triển.
 */
export function isSessionWorkingOnOffer(session) {
  return Boolean(session.emailFilled || session.completedScreens > 0 || session.leadCheckStatus
    || session.autofillActions > 0 || session.autofillFields > 0);
}

/**
 * Nhận diện tab không phải trang offer: offer hết hạn (404offer/unavailable), trang trắng,
 * lỗi HTTP 404/410/5xx, hoặc trang không có form/nút nào để làm. Tab đã được autofill thao tác
 * (có dấu data-ux-*) luôn được coi là trang offer đang làm.
 * Việc đóng tab hay đóng cả trình duyệt do watchTrafficBlockedPage quyết định theo tiến triển của phiên.
 *
 * @param {object} page Tab cần xét.
 * @param {{url?: string, since?: number}} tracker Trạng thái theo dõi của tab (URL đang đứng và mốc bắt đầu).
 * @return {Promise<string|null>} Lý do đóng, hoặc null nếu vẫn là trang offer / chưa đủ thời gian.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-27
 */
export async function getNonOfferReason(page, tracker) {
  if (!page || page.isClosed?.()) return null;
  const url = page.url?.() || '';
  if (url !== tracker.url) {
    tracker.url = url;
    tracker.since = Date.now();
  }
  const waited = Date.now() - tracker.since;
  if (/404offer\.com|\/\/unavailable\./i.test(url)) return 'Offer hết hạn (trang unavailable)';
  // Trang trung gian của luồng click/kiểm tra IP: không phải offer nhưng tự chuyển tiếp.
  if (/api\.ipify\.org|toffers\.top|adtrapper|adswapper/i.test(url)) return null;
  if (!url || url === 'about:blank') return waited >= NON_OFFER_WAIT_MS.blank ? 'Trang trắng (about:blank) không tải offer' : null;
  const status = page._uxMainStatus;
  if ([404, 410, 500, 502, 504].includes(status) && waited >= NON_OFFER_WAIT_MS.httpError) return `Trang lỗi HTTP ${status}`;
  if (waited < NON_OFFER_WAIT_MS.noForm) return null;
  // Xét cả iframe: form offer hay nằm trong iframe. Chỉ cần một frame có form/đáp án là giữ tab.
  const frames = typeof page.frames === 'function' ? page.frames() : [page];
  const results = await Promise.all(frames.map((f) => f.evaluate(detectOfferContentInPage).catch(() => null)));
  const found = results.filter(Boolean);
  if (found.length === 0) return null; // không đọc được trang: không đóng nhầm
  if (found.some((r) => r.challenge || r.worked || r.hasForm || r.hasChoices)) return null;
  return 'Trang không có form nhập / đáp án để chọn';
}

/**
 * Chạy trong trang (`frame.evaluate`): trang có ô nhập thật hoặc nhóm đáp án để chọn không.
 * Nút menu/cookie/chia sẻ, ô tìm kiếm, ô ở header/nav/footer (đăng ký bản tin) không tính —
 * trước đây chỉ cần có một nút hay iframe bất kỳ là tab quảng cáo/tin tức không bao giờ bị đóng.
 *
 * @return {{challenge: boolean, worked: boolean, hasForm: boolean, hasChoices: boolean}} Kết quả nhận diện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-31
 */
export function detectOfferContentInPage() {
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const chrome = (el) => Boolean(el.closest('header, nav, footer, [role="navigation"], [role="banner"], [role="contentinfo"], #footer, .footer, .site-footer'));
  const noise = /close|skip ad|learn more|ad ?choices|privacy|cookie|accept|reject|agree|menu|share|tweet|facebook|sign in|log ?in|sign up|subscribe|search|next article|read more/i;
  const fieldSel = 'input:not([type]), input[type="text"], input[type="email"], input[type="tel"], input[type="number"], input[type="date"], '
    + 'input[type="radio"], input[type="checkbox"], select, textarea';
  const hasForm = [...document.querySelectorAll(fieldSel)].some((el) => {
    if (!shown(el) || el.disabled || chrome(el)) return false;
    const hint = `${el.name || ''} ${el.id || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`;
    return !/search|^\s*q\s*$|newsletter/i.test(hint);
  });
  // Đáp án survey dạng nút/thẻ: >= 2 lựa chọn chữ ngắn cùng một khối cha.
  const choiceSel = '[role="radio"], [role="option"], [role="checkbox"], button, label, a[class*="btn"], a[class*="answer"], a[class*="option"], '
    + '[class*="answer"], [class*="option"], [class*="choice"]';
  const groups = new Map();
  for (const el of document.querySelectorAll(choiceSel)) {
    const text = String(el.innerText || '').trim();
    if (!text || text.length > 60 || noise.test(text) || !shown(el) || chrome(el)) continue;
    const parent = el.parentElement;
    groups.set(parent, (groups.get(parent) || 0) + 1);
  }
  return {
    challenge: /just a moment|checking your browser/i.test(document.title),
    worked: Boolean(document.querySelector('[data-ux-filled], [data-ux-clicked], [data-ux-qclicked], [data-ux-semantic-clicked], [data-ux-submitted]')),
    hasForm,
    hasChoices: [...groups.values()].some((n) => n >= 2),
  };
}

/**
 * Đóng cửa sổ và tự động mở proxy khác thay thế khi trang hiển thị thông báo "Traffic Blocked!".
 *
 * @param {object} session Phiên Chrome đã mở thành công.
 * @return {void} Gắn lịch kiểm tra vào các tab của phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-20
 */
export function watchTrafficBlockedPage(session) {
  if (!session || session.trafficWatcherAttached) return;
  session.trafficWatcherAttached = true;
  let checking = false;
  let blocked = false;
  const redirectTracker = new WeakMap();
  const nonOfferTracker = new WeakMap();

  // Bắt NGAY LẬP TỨC khi tab chuyển hướng tới trang lỗi đã click offer (toffers.top/error.php)
  const checkInstantToffersDup = async (p) => {
    try {
      if (blocked || checking || !p || (typeof p.isClosed === 'function' && p.isClosed())) return;
      const u = typeof p.url === 'function' ? p.url() : '';
      if (isToffersDuplicateOfferUrl(u)) {
        const slotNum = session.slot ?? ((session.tileIndex ?? 0) + 1);
        const label = session.chromeVersion
          ? `Chrome ${session.chromeVersion}`
          : (session.profileId ? `Profile ${session.profileId}` : `Slot ${slotNum}`);
        const dupReason = 'IP đã click offer trước đó (Toffers Duplicate IP)';

        console.log(`[ToffersDup] ${label} [Slot ${slotNum}|IP: ${session.exitIp || 'chưa rõ'}]: Phát hiện URL lỗi duplicate offer (${u}). Tự động đóng trình duyệt và bù slot mới ngay lập tức.`);
        blocked = true;
        clearInterval(timer);
        session.closingDueToTrafficBlocked = true;

        if (autoRefill.stopRequested || !autoRefill.enabled) {
          session.suppressAutoRefill = true;
          session.isClosed = true;
          activeBrowsers.delete(session);
          await p.close().catch(() => {});
          await session.browser?.close?.().catch(() => {});
          if (session._cdpBrowser) await session._cdpBrowser?.close?.().catch(() => {});
          if (session.isAdsPower) void requestManagedProfileStop(session);
          if (session.proxyKey) {
            await executeFile('pkill', ['-9', '-f', `user-data-dir.*${session.proxyKey}`]).catch(() => {});
          }
          return;
        }

        session.suppressAutoRefill = false;
        session.isClosed = true;

        try {
          if (session.proxyKey) {
            const history = await readProxyUsageHistory();
            if (history?.proxies?.[session.proxyKey]) {
              history.proxies[session.proxyKey] = {
                ...history.proxies[session.proxyKey],
                status: 'failed',
                reason: dupReason,
                completedAt: new Date().toISOString(),
              };
              await persistProxyUsageHistory(history);
            }
          }
        } catch {}

        autoRefill.message = `${label} (IP ${session.exitIp ?? 'chưa rõ'}) đã click offer trước đó; đã đóng cửa sổ và đang tự động mở sock khác thay thế…`;

        const logs = browserSessionLogs.get(session);
        if (logs) {
          logs.push({
            time: new Date().toISOString(),
            offer: session.offerNumber ?? session.streamRole ?? 1,
            type: 'toffers_duplicate_ip',
            detail: `${label} (IP: ${session.exitIp ?? 'chưa rõ'}) bị ${dupReason} [${u}]. Đóng cửa sổ và đổi sock khác.`,
          });
          queueSaveBrowserLogs();
        }

        session.updateBadge?.(`⚠️ <strong>IP trùng offer</strong> Đang đổi sock…`);
        chromeBuildRotationCounter += 1;

        await p.close().catch(() => {});
        await session.browser?.close?.().catch(() => {});
        if (session._cdpBrowser) await session._cdpBrowser?.close?.().catch(() => {});
        if (session.isAdsPower) void requestManagedProfileStop(session);
        if (session.proxyKey) {
          await executeFile('pkill', ['-9', '-f', `user-data-dir.*${session.proxyKey}`]).catch(() => {});
        }

        if (!autoRefill.stopRequested && autoRefill.enabled) {
          queueAutomaticRefill();
        }
      }
    } catch {}
  };

  const bindPageInstantCheck = (p) => {
    if (!p || p._toffersDupCheckBound) return;
    p._toffersDupCheckBound = true;
    p.on?.('framenavigated', () => { void checkInstantToffersDup(p); });
    void checkInstantToffersDup(p);
  };

  try {
    const existing = typeof session.browser?.pages === 'function' ? session.browser.pages() : [];
    existing.forEach(bindPageInstantCheck);
    session.browser?.on?.('page', bindPageInstantCheck);
  } catch {}

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

        // Hai tab cùng link: đóng tab trùng do trang tự bật ra, giữ tab gốc / tab mở trước.
        for (const dup of findDuplicateTabs(pages, (p) => p === session.mainPage || p._uxOriginTab === true)) {
          console.log(`[DupTab] Đóng tab trùng link ${dup.url()}.`);
          session.addBrowserLog?.({ type: 'duplicate_tab_closed', detail: `Đóng tab trùng link: ${dup.url()}` });
          dup._uxClosedByApp = 'tab trùng link';
          await dup.close().catch(() => {});
        }

        for (const page of pages) {
          if (typeof page?.isClosed === 'function' && page.isClosed()) continue;

          // 1. Kiểm tra trang có bị lỗi mạng hoặc thông báo blocked không; tab chính còn xét "không phải trang offer".
          if (!nonOfferTracker.has(page)) {
            nonOfferTracker.set(page, { url: '', since: Date.now() });
            page.on?.('response', (res) => {
              if (res.request().isNavigationRequest() && res.frame() === page.mainFrame()) page._uxMainStatus = res.status();
            });
          }
          let deadReason = await getDeadOrBlockedReason(page);
          if (!deadReason) {
            const isOrigin = page === session.mainPage || page._uxOriginTab === true;
            // Link gốc (tab chính + tab offer app tự mở) không bao giờ bị đóng vì quy tắc "không phải offer",
            // kể cả offer hết hạn / lỗi HTTP; quy tắc này chỉ áp cho tab do trang tự bật ra.
            const nonOfferReason = isOrigin ? null : await getNonOfferReason(page, nonOfferTracker.get(page));
            if (nonOfferReason) {
              // Lấy lại danh sách tab ngay lúc này: tab khác có thể vừa tự đóng trong vòng quét.
              const otherTabs = (session.browser?.pages?.() ?? []).filter((p) => p !== page && !p.isClosed?.());
              // Tab gốc (tab chính + các tab offer app tự mở lúc đầu) không bao giờ bị đóng riêng.
              if (otherTabs.length > 0 && !isOrigin) {
                // Chỉ đóng tab không phải offer do trang tự bật ra, giữ các tab còn lại.
                console.log(`[NonOffer] Đóng tab ${page.url()}: ${nonOfferReason}.`);
                session.addBrowserLog?.({ type: 'non_offer_tab_closed', detail: `Đóng tab không phải offer (${nonOfferReason}): ${page.url()}` });
                page._uxClosedByApp = `tab không phải offer: ${nonOfferReason}`;
                await page.close().catch(() => {});
                continue;
              }
              // Tab duy nhất còn lại: chỉ đóng cả trình duyệt + bù slot khi phiên chưa nhận offer/chưa làm gì.
              if (otherTabs.length === 0 && !isSessionWorkingOnOffer(session)) deadReason = nonOfferReason;
            }
          }
          if (deadReason) {
            const isToffersDup = deadReason.includes('Toffers Duplicate IP') || deadReason.includes('click offer');
            // Tab phụ bị lỗi thường → chỉ đóng tab đó, quay về tab chính (không đóng browser)
            // Nếu bị lỗi IP đã click offer (Toffers Duplicate IP) → cả IP đã bị cháy trên offer này, phải đóng toàn bộ trình duyệt và bù slot mới!
            if (!isToffersDup && page !== session.mainPage && !page._uxOriginTab) {
              console.log(`[DeadTab] Tab phụ bị ${deadReason} (${page.url()}), đóng tab và quay về tab chính.`);
              session.addBrowserLog?.({ type: 'traffic_blocked', detail: `Tab phụ bị ${deadReason}. Đóng tab, giữ trình duyệt.` });
              await page.close().catch(() => {});
              const remaining = (session.browser?.pages ? session.browser.pages() : []).filter((p) => !p.isClosed());
              if (remaining.length > 0) await (session.mainPage?.isClosed?.() ? remaining[0] : session.mainPage).bringToFront().catch(() => {});
              continue;
            }
            // Tab chính hoặc IP đã click offer bị lỗi → đóng cả browser và bù slot mới
            blocked = true;
            clearInterval(timer);
            session.closingDueToTrafficBlocked = true;
            if (autoRefill.stopRequested || !autoRefill.enabled) {
              session.suppressAutoRefill = true;
              session.isClosed = true;
              activeBrowsers.delete(session);
              await page.close().catch(() => {});
              await session.browser?.close?.().catch(() => {});
              if (session._cdpBrowser) await session._cdpBrowser?.close?.().catch(() => {});
              if (session.isAdsPower) void requestManagedProfileStop(session);
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
            if (session._cdpBrowser) await session._cdpBrowser?.close?.().catch(() => {});
            if (session.isAdsPower) void requestManagedProfileStop(session);
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
            // Landing "disabled" của adswapper/adtrapper = offer đã tắt / IP-geo bị từ chối.
            // Đóng NGAY, không tốn 24 giây reload (2 × 8s) vì trang này không bao giờ nhảy tab.
            const isDisabledLanding = /\/disabled(\.html)?(\?|\/|$)/i.test(currentUrl);
            if (isDisabledLanding) {
              const label = session.chromeVersion
                ? `Chrome ${session.chromeVersion}`
                : (session.profileId ? `Profile ${session.profileId}` : `Slot ${(session.tileIndex ?? 0) + 1}`);
              const disabledReason = 'Landing báo DISABLED (offer từ chối traffic/IP-geo)';
              clearInterval(timer);
              session.closingDueToTrafficBlocked = true;
              try {
                if (session.proxyKey) {
                  const history = await readProxyUsageHistory();
                  if (history?.proxies?.[session.proxyKey]) {
                    history.proxies[session.proxyKey] = {
                      ...history.proxies[session.proxyKey],
                      status: 'failed',
                      reason: disabledReason,
                      completedAt: new Date().toISOString(),
                    };
                    await persistProxyUsageHistory(history);
                  }
                }
              } catch {}

              autoRefill.message = `${label} (IP ${session.exitIp ?? 'chưa rõ'}) vào landing DISABLED của adswapper; `
                + 'đã đóng cửa sổ và đang tự động mở sock khác thay thế…';

              console.log(`[Adtrapper] ${label}: ${disabledReason}. Đóng ngay (không reload).`);
              const logs = browserSessionLogs.get(session);
              if (logs) {
                logs.push({
                  time: new Date().toISOString(),
                  offer: session.offerNumber ?? session.streamRole ?? 1,
                  type: 'adtrapper_disabled_close',
                  detail: `${label} (IP: ${session.exitIp ?? 'chưa rõ'}) vào landing disabled.html — offer từ chối traffic/IP. Đóng ngay và đổi sock khác.`,
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
 * Quyết định trình duyệt có chạy ẩn hoàn toàn (headless) hay không.
 *
 * "Chạy trong app" BẬT → chạy headless, người dùng xem qua tab Xem màn hình.
 * TẮT → cửa sổ Chrome/SunBrowser thật mở ra Desktop.
 * "Ẩn đến trang đích" và "Ẩn tới khi có lead" cũng bắt buộc phải chạy ẩn.
 *
 * @param {{screenPreviewOnly?: boolean, hideUntilTarget?: boolean, hideUntilLead?: boolean}} options Các cờ điều khiển chế độ hiển thị.
 * @return {boolean} True khi phải chạy ẩn hoàn toàn.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-22
 */
export function shouldRunHeadless({ screenPreviewOnly = true, hideUntilTarget = false, hideUntilLead = false } = {}) {
  return Boolean(screenPreviewOnly) || Boolean(hideUntilTarget) || Boolean(hideUntilLead);
}

/**
 * Tự thoát khi tiến trình cha chết.
 *
 * AutoLeadPCMacApp.swift chạy node bằng Process không gắn pipe stdin, và terminate()
 * trong applicationWillTerminate không chạy khi app bị quit qua AppleScript, nên node
 * con sống sót và giữ cổng — lần mở app sau gặp EADDRINUSE. macOS re-parent con sang
 * launchd (pid 1) khi cha chết nên chỉ cần so ppid.
 *
 * LƯU Ý: ppid đổi (kể cả về 1) nghĩa là cha đã chết. Trước đây điều kiện `ppid <= 1`
 * bị hiểu ngược thành "vẫn ổn" nên node mồ côi sống mãi và giữ cổng 3211 — app mới
 * không bao giờ lên được cổng, giao diện lại nối vào bản code cũ.
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
    if (process.ppid === parentPid) return;
    console.error('Tiến trình cha đã thoát, đóng máy chủ giao diện.');
    process.exit(0);
  }, 2000);
  // Không để watchdog là thứ giữ process sống; máy chủ HTTP làm việc đó.
  watchdog.unref();
}

// Đường dẫn lsof trên macOS: app chạy từ Finder có PATH tối giản nên phải thử từng đường dẫn.
const LSOF_PATHS = ['/usr/sbin/lsof', '/usr/bin/lsof', '/bin/lsof'];

/**
 * Tìm PID của tiến trình đang giữ cổng TCP.
 *
 * @param {number} port Cổng cần kiểm tra.
 * @return {Promise<number|null>} PID của tiến trình giữ cổng, null nếu cổng trống.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-22
 */
async function findPortHolderPid(port) {
  for (const lsofPath of LSOF_PATHS) {
    if (!existsSync(lsofPath)) continue;
    try {
      const { stdout } = await executeFile(lsofPath, ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { timeout: 5000 });
      const pid = Number.parseInt(String(stdout).trim().split('\n')[0] ?? '', 10);
      if (Number.isInteger(pid) && pid > 0 && pid !== process.pid) return pid;
    } catch {
      // lsof trả về code khác 0 khi không còn tiến trình nào giữ cổng.
    }
  }
  return null;
}

/**
 * Đọc lệnh chạy và thư mục làm việc của một tiến trình để xác định nó có phải máy chủ AutoLeadPC hay không.
 *
 * @param {number} pid PID cần kiểm tra.
 * @return {Promise<{command: string, workingDirectory: string}>} Lệnh chạy và thư mục làm việc.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-22
 */
async function describeProcess(pid) {
  let command = '';
  let workingDirectory = '';
  try {
    const { stdout } = await executeFile('/bin/ps', ['-o', 'command=', '-p', String(pid)], { timeout: 5000 });
    command = String(stdout).trim();
  } catch {
    // Tiến trình có thể đã chết trước khi đọc được thông tin.
  }
  for (const lsofPath of LSOF_PATHS) {
    if (!existsSync(lsofPath)) continue;
    try {
      const { stdout } = await executeFile(lsofPath, ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], { timeout: 5000 });
      const cwdLine = String(stdout).split('\n').find((line) => line.startsWith('n'));
      if (cwdLine) workingDirectory = cwdLine.slice(1);
    } catch {
      // Không đọc được cwd thì vẫn dựa vào lệnh chạy để quyết định.
    }
    break;
  }
  return { command, workingDirectory };
}

/**
 * Dừng tiến trình máy chủ AutoLeadPC cũ đang giữ cổng để bản mới phục vụ được.
 *
 * Chỉ dừng đúng tiến trình `node app.mjs` nằm trong thư mục launcher của AutoLeadPC;
 * tiến trình khác giữ cổng (app khác, công cụ khác) thì để nguyên và báo lỗi.
 *
 * @param {number} port Cổng đang bị chiếm.
 * @return {Promise<{released: boolean, reason: string}>} Kết quả giải phóng cổng.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-22
 */
async function releaseStalePortHolder(port) {
  const holderPid = await findPortHolderPid(port);
  if (!holderPid) return { released: true, reason: 'free' };

  const { command, workingDirectory } = await describeProcess(holderPid);
  const isAutoLeadServer = /node\s.*app\.mjs/.test(command) && /AutoLeadPC/i.test(workingDirectory);
  if (!isAutoLeadServer) return { released: false, reason: 'foreign-process' };

  console.warn(`[Server] Cổng ${port} đang bị máy chủ AutoLeadPC cũ giữ (PID ${holderPid}) — dừng tiến trình cũ để nạp code mới.`);
  try {
    process.kill(holderPid, 'SIGTERM');
  } catch {
    // Tiến trình đã chết: bỏ qua.
  }
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (!(await findPortHolderPid(port))) return { released: true, reason: 'terminated' };
  }
  try {
    process.kill(holderPid, 'SIGKILL');
  } catch {
    // Tiến trình đã chết: bỏ qua.
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  const stillHeld = await findPortHolderPid(port);
  return { released: !stillHeld, reason: 'killed' };
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
  await loadAutofillRejected();
  await loadAutofillQueue();
  await loadProxyQueue();
  await loadDualStreamState();
  await initializeEmailQueue();
  await loadEmailAutoRefillConfig();
  await loadProxy711Config();
  await loadProxy711AutoRefillConfig();
  await loadOfferStrategies();
  // Khi khởi động app: luôn reset về 0 (idle/stopped), không tự động chạy lại
  autoRefill.enabled = false;
  autoRefill.settings = null;
  autoRefill.targetCount = 0;
  autoRefill.queued = false;
  autoRefill.stopRequested = false;
  autoRefill.message = 'Sẵn sàng. Bấm Start để bắt đầu.';
  void writeFile(autoRefillSettingsPath, '{}', 'utf8').catch(() => {});
  await loadSavedDeviceProfiles();
  await loadPersistedBrowserLogs();
  loadAiConfig();
  await loadToffersConfig();
  await loadLeadStats();
  await loadBandwidthStats();
  startToffersBackgroundPolling(10_000);
  start711BalanceBackgroundPolling(30_000);
  const interfaceHtml = readFileSync(userInterfacePath, 'utf8');
  const interfacePcHtml = existsSync(userInterfacePcPath) ? readFileSync(userInterfacePcPath, 'utf8') : interfaceHtml;
  const handlers = {
    '/launch': runExclusively(launchUserRequestedBrowsers),
    '/launch-adspower': runExclusively(launchRequestedBrowsers),
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

    if ((request.method === 'GET' || request.method === 'HEAD') && (request.url === '/screen-mini' || request.url === '/mini')) {
      if (existsSync(userInterfaceMiniPath)) {
        const miniContent = readFileSync(userInterfaceMiniPath, 'utf8');
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        response.end(request.method === 'HEAD' ? undefined : miniContent);
        return;
      }
      response.writeHead(404); response.end();
      return;
    }

    if (request.method === 'GET' && request.url === '/tunnel') {
      const url = getTunnelUrl();
      respondWithJson(response, 200, { ok: true, active: Boolean(url), url: url || null });
      return;
    }

    if (request.method === 'POST' && request.url === '/tunnel/start') {
      const res = await startTunnel(port);
      respondWithJson(response, res.ok ? 200 : 500, res);
      return;
    }

    if (request.method === 'POST' && request.url === '/tunnel/stop') {
      stopTunnel();
      respondWithJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && request.url === '/launch-settings') {
      try {
        if (existsSync(lastLaunchSettingsPath)) {
          const raw = JSON.parse(readFileSync(lastLaunchSettingsPath, 'utf8'));
          respondWithJson(response, 200, { ok: true, settings: raw.settings, savedAt: raw.savedAt });
          return;
        }
      } catch {}
      respondWithJson(response, 200, { ok: true, settings: null });
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
        const filePath = join(baseDir, 'Config', 'Proxy', safeConfigFileName(body.file));
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
        const filePath = join(baseDir, 'Config', 'Proxy', safeConfigFileName(body.file));
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
            Thread: getVal('Thread') || '1',
            LimitRun: getVal('LimitRun') || '0',
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
        // Nạp methodConfigs từ file riêng
        let methodConfigs = [];
        const methodPath = join(offerDir, 'offer-methods.json');
        if (existsSync(methodPath)) {
          try {
            methodConfigs = JSON.parse(readFileSync(methodPath, 'utf8'));
            if (!Array.isArray(methodConfigs)) methodConfigs = [];
          } catch {}
        }
        respondWithJson(response, 200, { ...data, savedList, methodConfigs });
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
        const iniContent = `[Setting]\nProxy=Direct\nAuto=Manual work\nCheckDuplicate=False\n[Data]\nLinkOffer=${link1}\nLinkOffer2=${link2}\nLinkOffer3=${link3}\nLinkOffer4=${link4}\nNameOffer=${body.NameOffer || ''}\nScript=${body.Script || ''}\nComplete=${body.Complete || ''}\nTimeload1=${body.TimeLimit || '30'}\nTimeload2=40\ndelayStart=${body.delayStart || '1'}\ndelayStop=${body.delayStop || '1'}\nThread=${body.Thread || '1'}\nLimitRun=${body.LimitRun || '0'}\n`;
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
          Thread: body.Thread || '1',
          LimitRun: body.LimitRun || '0',
          methodConfigs: Array.isArray(body.methodConfigs) ? body.methodConfigs : [],
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

        // Lưu 4 cách giải (Cách 1 → Offer 1, Cách 2 → Offer 2, ...)
        if (Array.isArray(body.methodConfigs)) {
          const methodPath = join(offerDir, 'offer-methods.json');
          writeFileSync(methodPath, JSON.stringify(body.methodConfigs, null, 2), 'utf8');
          await loadOfferStrategies();
        }

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

    if (request.method === 'GET' && request.url === '/pc/offer-strategy/read') {
      try {
        const strategies = {};
        for (const [num, strat] of offerStrategyState) {
          strategies[num] = strat;
        }
        respondWithJson(response, 200, { strategies });
      } catch (err) {
        respondWithJson(response, 400, { error: err.message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/pc/offer-strategy/save') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const offerNum = Number(body.offerNumber);
        if (!Number.isInteger(offerNum) || offerNum < 1 || offerNum > 30) {
          respondWithJson(response, 400, { error: 'offerNumber is required' });
          return;
        }
        offerStrategyState.set(offerNum, {
          mode: ['auto_full', 'consent_only', 'manual', 'skip'].includes(body.mode) ? body.mode : 'auto_full',
          autoSubmit: body.autoSubmit !== false,
          maxPick: Number.isInteger(Number(body.maxPick)) && Number(body.maxPick) > 0 ? Number(body.maxPick) : null,
          pickRandom: body.pickRandom === true,
          notes: String(body.notes || ''),
          link: String(body.link || offerStrategyState.get(offerNum)?.link || '').trim(),
        });
        const offerDir = join(getAutoLeadPCDir(), 'Config', 'Offer');
        await mkdir(offerDir, { recursive: true });
        await writeFile(join(offerDir, 'offer-methods.json'), JSON.stringify(
          [...offerStrategyState].map(([offerNumber, strategy]) => ({ offerNumber, ...strategy })), null, 2,
        ), 'utf8');
        respondWithJson(response, 200, { success: true });
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
          CloakBrowser: getBool('CloakBrowser'),
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
          iPhone: getBool('iPhone'),
          iPad: getBool('iPad'),
          AdsPowerApiKey: await readAdsPowerApiKey(),
        });
      } catch (err) {
        respondWithJson(response, 200, {});
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/pc/settings/save') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        if (body.AdsPowerApiKey !== undefined) await saveAdsPowerApiKey(body.AdsPowerApiKey);
        const baseDir = getAutoLeadPCDir();
        const filePath = join(baseDir, 'Config', 'Settings', 'Settings.ini');
        const b = (val) => val ? 'True' : 'False';
        const bm = body.browserMode || 'Chrome';
        const content = `[Browser]\nChrome=${b(bm === 'Chrome')}\nChromeAdsPower=${b(bm === 'AdsPower')}\nChromeFirefox=${b(bm === 'Firefox')}\n[Setting]\nCloakBrowser=${b(body.CloakBrowser)}\nCanvas=${b(body.Canvas)}\nClientRects=${b(body.ClientRects)}\nWebGLImage=${b(body.WebGLImage)}\nFonts=${b(body.Fonts)}\nWebRTC=${b(body.WebRTC)}\nApiFakeIP=${b(body.ApiFakeIP)}\n[OperatingSystem]\nWindows=${b(body.Windows)}\nMac=${b(body.Mac)}\nLinux=${b(body.Linux)}\nAndroid=${b(body.Android)}\niPhone=${b(body.iPhone)}\niPad=${b(body.iPad)}\n`;
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

    if (request.method === 'GET' && request.url === '/cloakbrowser/status') {
      try {
        const status = getCloakBrowserStatus();
        respondWithJson(response, 200, status);
      } catch (err) {
        respondWithJson(response, 500, { error: err.message });
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
        const filePath = join(baseDir, 'Config', 'Browser', safeConfigFileName(body.file));
        let text = '';
        if (existsSync(filePath)) {
          text = readFileSync(filePath, 'utf8');
        } else {
          const fallback = join(baseDir, 'Config', safeConfigFileName(body.file));
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
        const filePath = join(baseDir, 'Config', 'Browser', safeConfigFileName(body.file));
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
      try {
        const stateBody = {
          ...getAutoRefillStatus(),
          limitRun: { count: limitRunCount, max: limitRunMax },
          toffers: {
            point: latestToffersOverview.point,
            leadCount: latestToffersOverview.results?.length || 0,
            updatedAt: latestToffersOverview.updatedAt,
          },
        };
        respondWithJson(response, 200, stateBody);
      } catch (stateErr) {
        // /state từng treo vĩnh viễn khi có exception đồng bộ (object vòng/undefined).
        // Trả 500 kèm message + 3 khung đầu của stack để chẩn đoán nhanh.
        console.error('[State] Lỗi dựng state:', stateErr?.stack?.split('\n').slice(0, 4).join(' | ') || stateErr?.message);
        respondWithJson(response, 500, {
          error: String(stateErr?.message || stateErr),
          stackTop: String(stateErr?.stack || '').split('\n').slice(0, 4),
        });
      }
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

    if (request.method === 'GET' && request.url === '/bandwidth/stats') {
      const summary = getBandwidthSummary();
      const sessionsBw = [...activeBrowsers]
        .filter((session) => !session.isClosed && (session.exitIp || session.isManagedProfile || session.slot))
        .map((session) => {
          const livePages = session.browser?.pages ? session.browser.pages().filter(p => !p.isClosed()) : [];
          return {
            slot: session.slot ?? (session.tileIndex + 1),
            exitIp: session.exitIp || 'Direct',
            proxy: session.proxyServer || session.proxyKey || 'Direct',
            totalBytes: session.bandwidthBytes || 0,
            formatted: formatBytes(session.bandwidthBytes || 0),
            bytesSent: session.bytesSent || 0,
            bytesReceived: session.bytesReceived || 0,
            requestCount: session.requestCount || 0,
            tabs: livePages.map((p, idx) => ({
              index: idx,
              url: (typeof p.url === 'function' ? p.url() : '') || '',
              totalBytes: p._bandwidthBytes || 0,
              formatted: formatBytes(p._bandwidthBytes || 0),
              bytesSent: p._bytesSent || 0,
              bytesReceived: p._bytesReceived || 0,
              requestCount: p._requestCount || 0,
            })),
          };
        })
        .sort((a, b) => a.slot - b.slot);

      respondWithJson(response, 200, {
        ...summary,
        activeSlots: sessionsBw,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/bandwidth/reset') {
      try {
        const bodyText = await readRequestBody(request).catch(() => '{}');
        const body = JSON.parse(bodyText || '{}');
        const scope = body.scope || 'today';
        const todayKey = getLocalDateKey();

        if (scope === 'today') {
          if (bandwidthDailyStats.daily[todayKey]) {
            const todayOld = bandwidthDailyStats.daily[todayKey];
            bandwidthDailyStats.totalBytesAllTime = Math.max(0, bandwidthDailyStats.totalBytesAllTime - (todayOld.totalBytes || 0));
            bandwidthDailyStats.totalUploadAllTime = Math.max(0, bandwidthDailyStats.totalUploadAllTime - (todayOld.bytesSent || 0));
            bandwidthDailyStats.totalDownloadAllTime = Math.max(0, bandwidthDailyStats.totalDownloadAllTime - (todayOld.bytesReceived || 0));
            bandwidthDailyStats.totalRequestsAllTime = Math.max(0, bandwidthDailyStats.totalRequestsAllTime - (todayOld.requestCount || 0));
            delete bandwidthDailyStats.daily[todayKey];
          }
        } else if (scope === 'all') {
          bandwidthDailyStats.totalBytesAllTime = 0;
          bandwidthDailyStats.totalUploadAllTime = 0;
          bandwidthDailyStats.totalDownloadAllTime = 0;
          bandwidthDailyStats.totalRequestsAllTime = 0;
          bandwidthDailyStats.daily = {};
        }

        queueSaveBandwidthStats();
        respondWithJson(response, 200, { ok: true, message: `Đã đặt lại dữ liệu băng thông (${scope}).` });
      } catch (err) {
        respondWithJson(response, 500, { error: err.message });
      }
      return;
    }

    // ── 711Proxy ──────────────────────────────────────────────
    if (request.method === 'GET' && request.url === '/711proxy/config') {
      respondWithJson(response, 200, {
        username: proxy711.username,
        passwd: proxy711.passwd || '',
        hasToken: Boolean(proxy711.token && Date.now() < proxy711.tokenExpiry),
        authMode: proxy711.authMode || 'subuser',
        subuser: proxy711.subuser || '',
        subpass: proxy711.subpass || '',
        gatewayHost: proxy711.gatewayHost || 'global.rotgbapi.trustsource.live',
        gatewayPort: proxy711.gatewayPort || 10000,
      });
      return;
    }

    if (request.method === 'POST' && request.url === '/711proxy/config') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        if (body.authMode) proxy711.authMode = body.authMode;
        if (body.subuser !== undefined) proxy711.subuser = String(body.subuser).trim();
        if (body.subpass !== undefined) proxy711.subpass = String(body.subpass).trim();
        if (body.gatewayHost) proxy711.gatewayHost = String(body.gatewayHost).trim();
        if (body.gatewayPort) proxy711.gatewayPort = parseInt(body.gatewayPort) || 10000;
        await saveProxy711Config();
        respondWithJson(response, 200, { ok: true, config: proxy711 });
      } catch (e) {
        respondWithJson(response, 400, { error: e.message });
      }
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

    if (request.method === 'GET' && (request.url === '/711proxy/balance' || request.url.startsWith('/711proxy/balance?'))) {
      const urlObj = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const force = urlObj.searchParams.get('refresh') === '1' || urlObj.searchParams.get('force') === '1';
      const bal = await get711Balance(force);
      respondWithJson(response, bal.ok ? 200 : 400, bal);
      return;
    }

    if (request.method === 'GET' && (request.url === '/711proxy/consumption' || request.url.startsWith('/711proxy/consumption?'))) {
      const urlObj = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
      const from = urlObj.searchParams.get('from');
      const to = urlObj.searchParams.get('to');
      const subuser = urlObj.searchParams.get('subuser') || '';
      const days = urlObj.searchParams.get('days') || 1;
      try {
        const chartData = await get711ConsumptionChart({ from, to, subuser, days });
        respondWithJson(response, 200, chartData);
      } catch (err) {
        respondWithJson(response, 500, { ok: false, error: err.message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/711proxy/package') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const val = Number(body.packageGb);
        if (!val || val <= 0 || isNaN(val)) {
          respondWithJson(response, 400, { error: 'Số GB gói không hợp lệ.' });
          return;
        }
        proxy711.packageGb = val;
        await saveProxy711Config();
        if (cached711Balance.ok) {
          const remainingGb = cached711Balance.remainingGb;
          const usedGb = Math.max(0, Number((val - remainingGb).toFixed(3)));
          const usedPercent = val > 0 ? Math.min(100, Number(((usedGb / val) * 100).toFixed(1))) : 0;
          cached711Balance = {
            ...cached711Balance,
            packageGb: val,
            packageFormatted: `${val.toFixed(2)} GB`,
            usedGb,
            usedFormatted: `${usedGb.toFixed(2)} GB`,
            usedPercent,
            remainingPercent: Number(Math.max(0, 100 - usedPercent).toFixed(1)),
          };
        }
        respondWithJson(response, 200, { ok: true, packageGb: val, balance: cached711Balance });
      } catch (e) {
        respondWithJson(response, 400, { error: e.message });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/711proxy/update-whitelist') {
      try {
        let ip = null;
        try {
          const body = JSON.parse(await readRequestBody(request));
          if (body?.ip) ip = String(body.ip).trim();
        } catch {}
        if (!ip) {
          const ipRes = await fetch('https://api.ipify.org?format=json');
          const data = await ipRes.json();
          ip = data?.ip;
        }
        if (!ip) throw new Error('Không thể xác định địa chỉ IP máy.');

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
      const authMode = body.authMode || proxy711.authMode || ((body.subuser || (proxy711.subuser && !proxy711.subuser.includes('='))) ? 'subuser' : 'api');
      const count = Math.min(Math.max(parseInt(body.count) || 50, 1), 200);
      const region = String(body.region || proxy711AutoRefill.region || 'US').trim().toUpperCase();
      const sessTime = Math.max(parseInt(body.sessTime) || 20, 1);
      const sessAuto = body.sessAuto !== undefined ? Boolean(body.sessAuto) : proxy711AutoRefill.sessAuto;

      try {
        let proxyLines = [];
        const isSubuserMode = authMode === 'subuser' || (authMode !== 'api' && Boolean(body.subuser || (proxy711.subuser && !proxy711.subuser.includes('='))));
        if (isSubuserMode) {
          const subuser = String(body.subuser || proxy711.subuser || '').trim();
          const subpass = String(body.subpass || proxy711.subpass || '').trim();
          const gateway = String(body.gateway || `${proxy711.gatewayHost}:${proxy711.gatewayPort}`).trim();
          if (!subuser || !subpass) {
            throw new Error('Chưa nhập Sub-user hoặc Sub-password 711Proxy. Vui lòng tạo tài khoản con trên dashboard 711proxy rồi điền vào app.');
          }
          proxy711.subuser = subuser;
          proxy711.subpass = subpass;
          proxy711.authMode = 'subuser';
          if (gateway) {
            const [gh, gp] = gateway.split(':');
            if (gh) proxy711.gatewayHost = gh;
            if (gp) proxy711.gatewayPort = parseInt(gp) || 10000;
          }
          await saveProxy711Config();

          proxyLines = generate711SubuserProxies({
            subuser,
            subpass,
            count,
            region,
            sessTime,
            sessAuto,
            gatewayHost: proxy711.gatewayHost,
            gatewayPort: proxy711.gatewayPort,
          });
        } else {
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
            genUrl.searchParams.set('sessAuto', String(sessAuto ? 1 : 0));
            const res = await fetch(genUrl.toString());
            if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
            const text = await res.text();
            if (!text.trim() || text.includes('"code"') || text.toLowerCase().includes('whitelist')) throw new Error(text.slice(0, 300));
            return text;
          }

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
                  throw new Error(`IP ${ip} chưa được whitelist 711proxy. Tự cập nhật whitelist thất bại (${wErr.message}).`);
                }
              } else {
                throw new Error(`IP ${ip || 'của bạn'} chưa có trong whitelist 711proxy. Vui lòng chuyển sang dùng chế độ User & Pass (không cần whitelist) hoặc đăng nhập để whitelist.`);
              }
            } else {
              throw e;
            }
          }
          // Chuẩn hóa: host:port → http://host:port, user:pass@host:port → http://user:pass@host:port
          const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          proxyLines = rawLines.map((l) => {
            if (/^https?:\/\//i.test(l)) return l;
            const at = l.lastIndexOf('@');
            if (at > 0) return `http://${l.slice(0, at)}@${l.slice(at + 1)}`;
            const parts = l.split(':');
            if (parts.length === 4) return `http://${encodeURIComponent(parts[2])}:${encodeURIComponent(parts[3])}@${parts[0]}:${parts[1]}`;
            // host:port không có creds
            return `http://${l}`;
          });
        }

        const added = importProxyLines(proxyLines, 'http');
        await saveProxyQueue();
        respondWithJson(response, 200, {
          ok: true,
          added,
          total: proxyQueue.available.length,
          authMode,
          lines: proxyLines,
          preview: proxyLines.slice(0, 3),
          message: `Đã nạp ${added} proxy (${authMode === 'subuser' ? 'User & Pass' : 'API Whitelist'}, ${region}, ${sessTime}p) vào hàng đợi (tổng ${proxyQueue.available.length} sẵn sàng).`,
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

    // ─── Telegram bot: xem / lưu cấu hình + gửi tin thử ──────────────────────
    if (request.method === 'GET' && request.url === '/telegram/config') {
      try {
        const config = await loadTelegramConfig();
        respondWithJson(response, 200, {
          botTokenMasked: config.botToken ? `${config.botToken.slice(0, 8)}…${config.botToken.slice(-4)}` : '',
          hasToken: Boolean(config.botToken),
          allowedUserId: config.allowedUserId || '',
          notifyChatId: config.notifyChatId || '',
          configured: Boolean(config.botToken && config.allowedUserId),
        });
      } catch {
        respondWithJson(response, 200, {
          botTokenMasked: '', hasToken: false, allowedUserId: '', notifyChatId: '', configured: false,
        });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/telegram/config') {
      try {
        const body = JSON.parse(await readRequestBody(request));
        const botToken = String(body.botToken || '').trim();
        const allowedUserId = Number(body.allowedUserId);
        const notifyChatId = body.notifyChatId ? Number(body.notifyChatId) : null;
        if (!botToken || !/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
          respondWithJson(response, 400, { ok: false, message: 'Bot Token không hợp lệ (dạng 123456789:AA...).' });
          return;
        }
        if (!Number.isFinite(allowedUserId) || allowedUserId <= 0) {
          respondWithJson(response, 400, { ok: false, message: 'User ID Telegram không hợp lệ (chỉ gồm chữ số).' });
          return;
        }
        await saveTelegramConfig({ botToken, allowedUserId, notifyChatId });
        const reload = await reloadTelegramBot().catch((error) => ({ running: false, error: error.message }));
        respondWithJson(response, 200, {
          ok: true,
          running: Boolean(reload?.running),
          message: reload?.running
            ? 'Đã lưu cấu hình và khởi động lại Telegram bot.'
            : `Đã lưu cấu hình nhưng bot chưa chạy${reload?.error ? `: ${reload.error}` : ' (kiểm tra lại token/quyền).'}`,
        });
      } catch (error) {
        respondWithJson(response, 500, { ok: false, message: `Lưu cấu hình Telegram thất bại: ${error.message}` });
      }
      return;
    }

    if (request.method === 'POST' && request.url === '/telegram/test') {
      const result = await sendTelegramTestMessage();
      respondWithJson(response, result.ok ? 200 : 400, result);
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

    // Nạp ngay một lô email từ path đang cấu hình (cộng thêm, không xóa hàng đợi). Đổi path thì đọc lại từ đầu file.
    if (request.method === 'POST' && request.url === '/email-queue/load-from-path') {
      const body = JSON.parse(await readRequestBody(request));
      const sourcePath = String(body.sourcePath ?? emailAutoRefill.sourcePath).trim();
      try {
        await access(sourcePath);
      } catch {
        respondWithJson(response, 400, { error: `Không đọc được file: ${sourcePath || '(chưa nhập path)'}` });
        return;
      }
      if (sourcePath !== emailAutoRefill.sourcePath) emailAutoRefill.byteOffset = 0;
      emailAutoRefill.sourcePath = sourcePath;
      if (typeof body.batchSize === 'number' && body.batchSize > 0) emailAutoRefill.batchSize = body.batchSize;
      const added = await refillEmailBatchFromSource();
      await saveEmailAutoRefillConfig();
      respondWithJson(response, 200, {
        added,
        available: emailQueue.available.length,
        message: added > 0
          ? `Đã nạp ${added} email từ file (tổng sẵn sàng: ${emailQueue.available.length}).`
          : 'Không có email mới: đã đọc hết file (bấm "Reset vị trí" để đọc lại từ đầu).',
      });
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
      // Autofill chỉ chạy tiếp khi screen5LeadVerified = true (xem guard đầu vòng quét trong autofill.mjs).
      foundSession.screen5LeadVerified = true;
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

    if (request.method === 'GET' && request.url === '/browser-logs/download-all') {
      try {
        const archive = await createBrowserLogsArchive();
        response.writeHead(200, {
          'content-type': 'application/zip',
          'content-disposition': `attachment; filename="autoleadpc-interfaces-${new Date().toISOString().slice(0, 10)}.zip"`,
          'content-length': archive.length,
          'cache-control': 'no-store',
        });
        response.end(archive);
      } catch (err) {
        respondWithJson(response, 500, { success: false, error: err.message });
      }
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

        const versionStr = stdout.trim();

        // Gửi test prompt ngắn để xác thực AI model có khả dụng và phản hồi thật sự
        let promptOk = false;
        let sampleReply = '';
        let promptErr = null;
        try {
          sampleReply = await callAgt('1+1=? Trả lời duy nhất 1 chữ số.', {
            cliBinary: binName,
            timeoutSeconds: 15,
            allowFallback: false,
          });
          promptOk = true;
          sampleReply = String(sampleReply || '').trim().slice(0, 80);
        } catch (pErr) {
          promptErr = pErr.message;
        }

        if (promptOk) {
          respondWithJson(response, 200, {
            success: true,
            binary: binName,
            version: versionStr,
            sampleReply,
            message: `✓ Kết nối thành công: ${binName} (${versionStr}) | AI phản hồi tốt: "${sampleReply}"`,
          });
        } else {
          respondWithJson(response, 200, {
            success: false,
            binary: binName,
            version: versionStr,
            error: promptErr,
            message: `Binary "${binName}" (${versionStr}) có mặt nhưng AI không thể phản hồi: ${promptErr}. Gợi ý: Hãy kiểm tra quota / quyền hoặc chuyển sang agy.`,
          });
        }
      } catch (err) {
        respondWithJson(response, 200, {
          success: false,
          error: err.message,
          message: `Không thể tìm thấy hoặc gọi binary "${body?.binary || 'agy'}": ${err.message}`,
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
      const diagnostics = session.screenDiagnostics ??= {
        windowStartedAt: Date.now(),
        requests: 0,
        captures: 0,
        captureFailures: 0,
        captureDurationTotalMs: 0,
        captureDurationMaxMs: 0,
      };
      diagnostics.requests += 1;
      if (Date.now() - diagnostics.windowStartedAt >= 10_000) {
        const averageCaptureMs = diagnostics.captures
          ? Math.round(diagnostics.captureDurationTotalMs / diagnostics.captures)
          : 0;
        console.log(`[ScreenDiag] slot=${slot} window=10s requests=${diagnostics.requests} captures=${diagnostics.captures} captureErrors=${diagnostics.captureFailures} avgCaptureMs=${averageCaptureMs} maxCaptureMs=${diagnostics.captureDurationMaxMs} pageCount=${session.browser.pages().filter(p => !p.isClosed()).length}`);
        diagnostics.windowStartedAt = Date.now();
        diagnostics.requests = 0;
        diagnostics.captures = 0;
        diagnostics.captureFailures = 0;
        diagnostics.captureDurationTotalMs = 0;
        diagnostics.captureDurationMaxMs = 0;
      }
      try {
        const pages = session.browser.pages().filter(p => !p.isClosed());
        const page = (session.mainPage && !session.mainPage.isClosed()) ? session.mainPage : pages[0];
        if (!page) { response.writeHead(404); response.end(); return; }
        // Ảnh thu nhỏ được hỏi mỗi 1,5s: chỉ chụp một lần mỗi lúc, chụp có giới hạn thời gian và trả ảnh gần nhất
        // trong lúc chờ, để các lệnh chụp không dồn lại làm Chrome đơ.
        // Ảnh vừa chụp < 3s thì dùng lại, không chụp mới (giảm tải Chrome khi nhiều slot cùng hiện thumbnail).
        const snapshotFresh = session.lastSnapshot && Date.now() - (session.lastSnapshotAt || 0) < 3000;
        if (!session.snapshotInFlight && !snapshotFresh) {
          const captureStartedAt = Date.now();
          session.snapshotInFlight = page.screenshot({ type: 'jpeg', quality: 45, scale: 'css', timeout: 5000 })
            .then((buf) => {
              const captureDurationMs = Date.now() - captureStartedAt;
              diagnostics.captures += 1;
              diagnostics.captureDurationTotalMs += captureDurationMs;
              diagnostics.captureDurationMaxMs = Math.max(diagnostics.captureDurationMaxMs, captureDurationMs);
              session.lastSnapshot = buf;
              session.lastSnapshotAt = Date.now();
              return buf;
            })
            .catch((error) => {
              diagnostics.captureFailures += 1;
              console.warn(`[ScreenDiag] slot=${slot} captureError=${error.message}`);
              return session.lastSnapshot ?? null;
            })
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

      // 3. Bắt đầu screencast với độ phân giải theo viewport thực tế, chất lượng sắc nét 75
      const vp = typeof targetPage?.viewportSize === 'function' ? targetPage.viewportSize() : null;
      const targetMaxWidth = Math.max(1280, vp?.width || 1280);
      const targetMaxHeight = Math.max(800, vp?.height || 800);
      await cdpSession.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 75,
        maxWidth: targetMaxWidth,
        maxHeight: targetMaxHeight,
        everyNthFrame: 1,
      }).catch((err) => {
        console.warn('[ScreenStream] Lỗi startScreencast:', err.message);
      });

      // 4. Gửi ngay lập tức 1 frame ban đầu bằng captureScreenshot hoặc page.screenshot để màn hình hiện ảnh trong 15ms
      try {
        const initShot = await cdpSession.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 }).catch(() => null);
        if (initShot?.data && !scObj.sseResponse.writableEnded) {
          scObj.lastFrameTime = Date.now();
          scObj.sseResponse.write(`data: ${initShot.data}\n\n`);
        } else if (targetPage && !targetPage.isClosed() && !scObj.sseResponse.writableEnded) {
          const buf = await targetPage.screenshot({ type: 'jpeg', quality: 75 }).catch(() => null);
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
            const shot = await cdpSession.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 }).catch(() => null);
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

      // Trình duyệt giữ nguyên trạng thái chạy ngầm, không tự bung cửa sổ ra Desktop khi xem trực tiếp trong app
      // Chỉ khi người dùng bấm nút hiện cửa sổ ngoài Desktop thì mới bung ra

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
        bandwidthBytes: p._bandwidthBytes || 0,
        bandwidthFormatted: formatBytes(p._bandwidthBytes || 0),
        bytesSent: p._bytesSent || 0,
        bytesReceived: p._bytesReceived || 0,
        requestCount: p._requestCount || 0,
      })));
      respondWithJson(response, 200, {
        tabs,
        bandwidthBytes: session.bandwidthBytes || 0,
        bandwidthFormatted: formatBytes(session.bandwidthBytes || 0),
        bytesSent: session.bytesSent || 0,
        bytesReceived: session.bytesReceived || 0,
        requestCount: session.requestCount || 0,
      });
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
          session.suppressAutoRefill = true;
          session.addBrowserLog?.({ type: 'manual_browser_closed', detail: 'Đã đóng tab cuối cùng qua Screen View; tắt trình duyệt.' });
          if (autoRefill.enabled && !autoRefill.stopRequested && autoRefill.targetCount > 0) {
            autoRefill.targetCount -= 1;
            void saveAutoRefillSettings();
          }
          await session.browser?.close?.().catch(() => {});
          respondWithJson(response, 200, { ok: true, closedSession: true, remaining: 0 });
          return;
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

    // Quay lại trang trước của tab đang xem trong Screen View (nút ◀ Quay lại)
    if (request.method === 'POST' && request.url.startsWith('/screen/back/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const sc = screencastSessions.get(slot);
      if (!sc?.page || sc.page.isClosed()) { respondWithJson(response, 404, { error: 'not found' }); return; }
      const res = await sc.page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch((err) => ({ error: err.message }));
      // goBack trả null khi tab không còn trang trước để quay lại.
      if (res === null) { respondWithJson(response, 200, { ok: false, reason: 'no_history' }); return; }
      if (res?.error) { respondWithJson(response, 500, { error: res.error }); return; }
      const backSession = [...activeBrowsers].find((s) => (s.slot ?? s.tileIndex + 1) === slot);
      backSession?.addBrowserLog?.({ type: 'navigate', detail: `Quay lại trang trước qua Screen View: ${sc.page.url()}` });
      respondWithJson(response, 200, { ok: true, url: sc.page.url() });
      return;
    }

    // Làm mới (Reload) trang của tab đang xem trong Screen View
    if (request.method === 'POST' && request.url.startsWith('/screen/reload/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const sc = screencastSessions.get(slot);
      if (!sc?.page || sc.page.isClosed()) { respondWithJson(response, 404, { error: 'not found' }); return; }
      await sc.page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      const reloadSession = [...activeBrowsers].find((s) => (s.slot ?? s.tileIndex + 1) === slot);
      reloadSession?.addBrowserLog?.({ type: 'navigate', detail: `Làm mới trang qua Screen View: ${sc.page.url()}` });
      respondWithJson(response, 200, { ok: true, url: sc.page.url() });
      return;
    }

    // Điều hướng (Navigate) tới URL mới từ thanh địa chỉ Screen View
    if (request.method === 'POST' && request.url.startsWith('/screen/navigate/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const sc = screencastSessions.get(slot);
      if (!sc?.page || sc.page.isClosed()) { respondWithJson(response, 404, { error: 'not found' }); return; }
      try {
        const body = JSON.parse(await readRequestBody(request));
        let targetUrl = String(body.url || '').trim();
        if (targetUrl && !/^https?:\/\//i.test(targetUrl)) {
          targetUrl = `https://${targetUrl}`;
        }
        if (targetUrl) {
          await sc.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
          const navSession = [...activeBrowsers].find((s) => (s.slot ?? s.tileIndex + 1) === slot);
          navSession?.addBrowserLog?.({ type: 'navigate', detail: `Điều hướng qua Screen View tới: ${targetUrl}` });
        }
        respondWithJson(response, 200, { ok: true, url: sc.page.url() });
      } catch (err) {
        respondWithJson(response, 500, { error: err.message });
      }
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
            // Click vào ô select: không gửi click (popup native không hiện trong screencast) mà trả danh sách
            // lựa chọn để Screen View tự vẽ. mouseup chờ bước này xong để giữ đúng thứ tự nhấn/nhả.
            sc.selectPick = null;
            sc.pointerCheck = (body.button || 'left') === 'left' && sc.page && !sc.page.isClosed()
              ? findSelectAtPoint(sc.page, targetX, targetY).catch(() => null)
              : Promise.resolve(null);
            const picked = await sc.pointerCheck;
            if (picked) {
              sc.selectPick = picked;
              respondWithJson(response, 200, { ok: true, select: { options: picked.options, selectedIndex: picked.selectedIndex } });
              return;
            }
            await cdpClient.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: targetX, y: targetY, button: body.button || 'left', clickCount: body.clickCount || 1, modifiers: body.modifiers || 0 });
          } else if (body.type === 'mouseup') {
            if (await sc.pointerCheck) { respondWithJson(response, 200, { ok: true }); return; }
            await cdpClient.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: targetX, y: targetY, button: body.button || 'left', clickCount: body.clickCount || 1, modifiers: body.modifiers || 0 });
            const clickedSession = [...activeBrowsers].find((item) => (item.slot ?? (item.tileIndex ?? -1) + 1) === slot);
            clickedSession?.addBrowserLog?.({ type: 'click', detail: `Click tay qua Screen View (${body.button || 'left'}) tại (${targetX}, ${targetY})` });
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
        } else if (body.type === 'reload') {
          if (sc.page && !sc.page.isClosed()) {
            await sc.page.reload({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
          }
        } else if (body.type === 'back') {
          if (sc.page && !sc.page.isClosed()) {
            await sc.page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          }
        } else if (body.type === 'forward') {
          if (sc.page && !sc.page.isClosed()) {
            await sc.page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          }
        } else if (body.type === 'scrollPage') {
          if (sc.page && !sc.page.isClosed()) {
            const dir = body.direction || 'down';
            await sc.page.evaluate((d) => {
              if (d === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
              else if (d === 'bottom') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
              else if (d === 'up') window.scrollBy({ top: -window.innerHeight * 0.75, behavior: 'smooth' });
              else window.scrollBy({ top: window.innerHeight * 0.75, behavior: 'smooth' });
            }, dir).catch(() => {});
          }
        } else if (body.type === 'select') {
          // Người dùng chọn một dòng trong danh sách select Screen View vừa hiện.
          const pick = sc.selectPick;
          if (!pick) { respondWithJson(response, 409, { error: 'select không còn' }); return; }
          await pick.frame.locator(`select[data-ux-screen-select="${pick.uid}"]`).selectOption({ index: Number(body.index) }, { timeout: 3000 });
          const clickedSession = [...activeBrowsers].find((item) => (item.slot ?? (item.tileIndex ?? -1) + 1) === slot);
          clickedSession?.addBrowserLog?.({ type: 'click', detail: `Chọn tay qua Screen View: ${pick.options[body.index]?.label ?? body.index}` });
        } else if (body.type === 'shortcut') {
          // Phím tắt hệ thống: Cmd/Ctrl + A/X/C/V → thực hiện copy/cut/paste/select-all tự nhiên
          // qua CDP Input.dispatchKeyEvent với commands (Chrome DevTools Protocol).
          if (cdpClient) {
            const commandMap = {
              copy: 'copy',
              cut: 'cut',
              paste: 'paste',
              selectAll: 'selectAll',
            };
            const command = commandMap[body.command];
            if (command) {
              if (command === 'paste') {
                // Văn bản dán được chèn đúng một lần qua page.keyboard.insertText bên dưới; không gửi CDP ở đây.
              } else {
                await cdpClient.send('Input.dispatchKeyEvent', {
                  type: 'keyDown',
                  key: body.key || (command === 'selectAll' ? 'a' : 'c'),
                  code: body.code || '',
                  modifiers: body.modifiers || 0,
                  commands: [command],
                }).catch(() => {});
                await cdpClient.send('Input.dispatchKeyEvent', {
                  type: 'keyUp',
                  key: body.key || (command === 'selectAll' ? 'a' : 'c'),
                  code: body.code || '',
                  modifiers: body.modifiers || 0,
                }).catch(() => {});
              }
            }
          }
          // Clipboard đi qua macOS (pbcopy/pbpaste) thay vì clipboard của trình duyệt: Chrome headless không nối với
          // clipboard hệ thống, còn WKWebView của app không phát sự kiện paste trên canvas → Cmd+C/V không chạy.
          if (sc.page && !sc.page.isClosed() && (body.command === 'copy' || body.command === 'cut')) {
            const selected = await sc.page.evaluate(() => {
              const el = document.activeElement;
              if (el && /^(INPUT|TEXTAREA)$/.test(el.tagName) && typeof el.selectionStart === 'number') {
                return el.value.slice(el.selectionStart, el.selectionEnd);
              }
              return String(window.getSelection() || '');
            }).catch(() => '');
            if (selected) {
              await new Promise((resolve) => {
                const child = execFile('pbcopy', resolve);
                child.stdin.end(selected);
              });
            }
          }
          if (sc.page && !sc.page.isClosed() && body.command === 'paste') {
            const text = body.text || (await executeFile('pbpaste').catch(() => ({ stdout: '' }))).stdout;
            if (text) await sc.page.keyboard.insertText(text).catch(() => {});
          }
          respondWithJson(response, 200, { ok: true });
          return;
        } else if (body.type === 'key' || body.type === 'keydown' || body.type === 'char' || body.type === 'insertText') {
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

    // ── Điều khiển hiển thị cửa sổ trình duyệt Desktop on-demand ──────────────
    // Hiện cửa sổ trình duyệt ra màn hình Desktop cho 1 slot
    if (request.method === 'POST' && request.url.startsWith('/browser/show/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
      if (!session) { respondWithJson(response, 404, { error: `Không tìm thấy luồng Slot ${slot}` }); return; }
      try {
        await session.showWindow?.(true);
        respondWithJson(response, 200, { ok: true, slot, visible: true });
      } catch (err) { respondWithJson(response, 500, { error: err.message }); }
      return;
    }

    // Thu nhỏ cửa sổ trình duyệt về chạy ngầm cho 1 slot
    // Tắt riêng một trình duyệt (nút ✕ trên dòng của bảng trình duyệt): như người dùng tự đóng, không bù slot.
    if (request.method === 'POST' && request.url.startsWith('/browser/close/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
      if (!session) { respondWithJson(response, 404, { error: `Không tìm thấy luồng Slot ${slot}` }); return; }
      session.suppressAutoRefill = true;
      session.addBrowserLog?.({ type: 'manual_browser_closed', detail: 'Người dùng tắt trình duyệt bằng nút ✕ trong bảng; không tự bù slot.' });
      if (autoRefill.enabled && !autoRefill.stopRequested && autoRefill.targetCount > 0) {
        autoRefill.targetCount -= 1;
        void saveAutoRefillSettings();
      }
      await session.browser?.close?.().catch(() => {});
      respondWithJson(response, 200, { ok: true, slot });
      return;
    }

    if (request.method === 'POST' && request.url.startsWith('/browser/hide/')) {
      const slot = parseInt(request.url.split('/').pop(), 10);
      const session = [...activeBrowsers].find(s => !s.isClosed && (s.slot ?? s.tileIndex + 1) === slot);
      if (!session) { respondWithJson(response, 404, { error: `Không tìm thấy luồng Slot ${slot}` }); return; }
      try {
        await session.hideWindow?.();
        respondWithJson(response, 200, { ok: true, slot, visible: false });
      } catch (err) { respondWithJson(response, 500, { error: err.message }); }
      return;
    }

    // Hiện tất cả cửa sổ trình duyệt ra Desktop
    if (request.method === 'POST' && request.url === '/browser/show-all') {
      const liveSessions = [...activeBrowsers].filter(s => !s.isClosed);
      await Promise.allSettled(liveSessions.map(s => s.showWindow?.(true)));
      respondWithJson(response, 200, { ok: true, count: liveSessions.length });
      return;
    }

    // Thu nhỏ tất cả cửa sổ trình duyệt về chạy ngầm trong app
    if (request.method === 'POST' && request.url === '/browser/hide-all') {
      const liveSessions = [...activeBrowsers].filter(s => !s.isClosed);
      await Promise.allSettled(liveSessions.map(s => s.hideWindow?.()));
      respondWithJson(response, 200, { ok: true, count: liveSessions.length });
      return;
    }
    // ─────────────────────────────────────────────────────────────────────────

    response.writeHead(404);
    response.end('Not found');
  });

  // Không có listener thì EADDRINUSE nổ thành stack trace khi app đã chạy sẵn.
  const listenHost = process.argv.includes('--public') ? '0.0.0.0' : '127.0.0.1';
  let portTakeoverAttempted = false;
  server.on('error', async (error) => {
    if (error.code === 'EADDRINUSE') {
      if (!portTakeoverAttempted) {
        portTakeoverAttempted = true;
        // Máy chủ cũ còn sót (app bị tắt cưỡng) vẫn giữ cổng và phục vụ code cũ.
        // Dừng nó rồi tự chiếm lại cổng để bản build mới thực sự chạy.
        const takeover = await releaseStalePortHolder(port);
        if (takeover.released) {
          console.log(`[Server] Đã giải phóng cổng ${port}, khởi động lại máy chủ giao diện.`);
          server.listen(port, listenHost, onServerListening);
          return;
        }
        console.error(`Cổng ${port} đang có tiến trình khác dùng — AutoLeadPC Mac có thể đang mở rồi.`);
      } else {
        console.error(`Cổng ${port} vẫn bị chiếm sau khi đã dừng tiến trình cũ.`);
      }
      // Không phục vụ được thì thoát hẳn: tiến trình sống sót chỉ giữ cổng và làm
      // bản app mới không bao giờ lên được cổng (giao diện nối nhầm vào code cũ).
      process.exit(1);
      return;
    }
    throw error;
  });

  /**
   * Xử lý sự kiện máy chủ đã lắng nghe xong: mở giao diện và bật các tiến trình nền.
   *
   * @return {Promise<void>} Hoàn tất khi giao diện đã được mở (nếu không chạy ẩn).
   * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
   * @since 2026-10-22
   */
  async function onServerListening() {
    const interfaceUrl = `http://127.0.0.1:${port}`;
    console.log(`AutoLeadPC Mac [Bản ${instanceId}] đang chạy tại ${interfaceUrl}`);
    if (listenHost === '0.0.0.0') console.log(`[Hub] Lắng nghe trên tất cả giao diện mạng — agent có thể kết nối qua IP LAN:${port}`);
    startTunnel(port).then((res) => {
      if (res?.ok && res.url) {
        console.log(`[Hub] Tunnel đã sẵn sàng (${res.url}), đồng bộ menu bot Telegram...`);
        registerBotCommands().catch(() => {});
      }
    }).catch(() => {});
    void startTelegramBot();
    // Tự xoá log mỗi 10 phút (log trình duyệt, file HTML, file chụp HTML offer-html-full).
    setInterval(() => void purgeLogsPeriodically(), LOG_PURGE_INTERVAL_MS);
    if (process.env.AUTOLEADPC_NO_OPEN === '1') return;
    try {
      await executeFile('open', [interfaceUrl]);
    } catch {
      console.log(`Mở URL này trong trình duyệt: ${interfaceUrl}`);
    }
  }

  // Cài watchdog TRƯỚC khi lắng nghe: nếu lắng nghe hỏng thì tiến trình cũng phải
  // tự thoát khi cha chết, không được sống sót giữ cổng.
  exitWhenParentExits();
  // Dọn trình duyệt mồ côi từ phiên trước: app vừa khởi động là KHÔNG có session nào
  // trong bộ nhớ, còn lại Chrome/SunBrowser chạy ngầm từ lần trước sẽ biến thành
  // "web đang chạy nhưng tab Running không thấy gì". Kill sạch trước khi nhận luồng mới.
  for (const profileRoot of ['AutoLeadPC-2', 'AutoLeadPC-3', 'AutoLeadPC', 'AutoLeadPC-AdsPower-Smoke', 'AutoLeadPC-Debug', 'AutoLeadPC Wine']) {
    await executeFile('pkill', ['-9', '-f', `user-data-dir.*Application Support/${profileRoot}`]).catch(() => {});
  }
  server.listen(port, listenHost, onServerListening);
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

// Không dùng import.meta.main: Node cũ trả undefined nên app thoát im lặng, không lên server.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const hubArg = process.argv.find((a) => a.startsWith('--hub='));
  if (hubArg) {
    startAgentMode(hubArg.slice(6)).catch((e) => { console.error(e.message); process.exitCode = 1; });
  } else {
    startLocalInterface().catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
