import { createServer } from 'node:http';
import { get as requestHttps } from 'node:https';
import { access, cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import {
  installChromeVersions,
  listInstalledChromeVersions,
} from './chrome-versions.mjs';
import { startAuthenticatedSocksRelay } from './relay.mjs';
import { attachAutofill, parseAutofillRecords } from './autofill.mjs';
import {
  DEFAULT_LEAD_CONFIG,
  fetchLeadDatas,
  isLeadPresent,
  normalizeIpAddress,
} from './lead-check.mjs';

const executeFile = promisify(execFile);
const activeBrowsers = new Set();
let chromeBuildRotationCounter = 0;
/** @type {Map<object, Array<{time:string,type:string,[key:string]:any}>>} */
const browserSessionLogs = new Map();
const autoRefill = {
  enabled: true,
  settings: null,
  targetCount: 0,
  queued: false,
  message: 'Tự bù đang bật; mở profile để bắt đầu.',
};
let proxyHistoryWriteQueue = Promise.resolve();
const userInterfacePath = new URL('./index.html', import.meta.url);
const userAgentListPath = new URL('./useragents.txt', import.meta.url);
const interactionLogDirectory = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC', 'logs');
const chromeProfileDirectory = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC', 'chrome-profiles');
const chromeProfileCacheDirectory = join(homedir(), 'Library', 'Caches', 'AutoLeadPC', 'chrome-profiles');
const installedChromeAppPath = process.env.AUTOLEADPC_CHROME_APP || '/Applications/Google Chrome.app';
const chromeChannelDirectory = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC', 'chrome-channels');
const chromeRegularBuildDirectory = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC', 'chrome-regular-builds');
const roboFormExtensionId = 'pnlccmojcmeohlpggmfnbbiapkmbliob';
const chromeTemplateProfileDirectory = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC', 'chrome-template-profile');
const chromeTemplateMetadataName = 'autoleadpc-template.json';
// Khóa tiến trình, cache và phiên tab của profile mẫu không được chép sang profile mới.
const chromeTemplateSkippedNames = new Set([
  'SingletonLock', 'SingletonCookie', 'SingletonSocket', 'RunningChromeVersion', chromeTemplateMetadataName,
  'Cache', 'Code Cache', 'GPUCache', 'ShaderCache', 'GrShaderCache', 'GraphiteDawnCache', 'DawnCache',
  'DawnGraphiteCache', 'DawnWebGPUCache', 'Crashpad', 'Sessions',
]);
let templateProfileContext = null;
const proxyUsageHistoryPath = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC', 'proxy-usage.json');
const autofillUsedPath = join(homedir(), 'Library', 'Application Support', 'AutoLeadPC', 'autofill-used.json');
/** @type {Set<string>} fingerprint = JSON của record đã dùng */
let autofillUsedKeys = new Set();
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

const maxAliveBrowsers = Math.max(1, Math.min(6, Math.floor(Number(process.env.AUTOLEADPC_MAX_ALIVE) || 6)));

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
 * host:port, host:port|user|pass (gồm cả PacketStream), host:port|phút|reset-url.
 * Từ chối rõ ràng SSH proxy và API key provider vì bản Mac không dựng tunnel và
 * không gọi API provider.
 *
 * @param {string} line Một URL proxy hoặc host:port|username|password.
 * @param {number} lineNumber Số dòng để hiển thị lỗi nhập liệu.
 * @param {string} proxyType Scheme mặc định cho dòng chỉ có host:port.
 * @return {{server: string, username?: string, password?: string}|null} Cấu hình proxy hoặc null nếu dòng trống.
 * @throws {Error} Khi proxy không đúng định dạng được hỗ trợ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-08
 */
export function parseProxyLine(line, lineNumber, proxyType = 'socks5') {
  const value = line.trim();
  if (!value || value.startsWith('#')) return null;

  // Phải neo scheme ở đầu dòng: format host:port|phút|reset-url cũng chứa "://".
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const proxyUrl = new URL(value);
    if (!['socks5:', 'http:'].includes(proxyUrl.protocol) || !proxyUrl.hostname || !proxyUrl.port) {
      throw new Error(`Dòng ${lineNumber}: URL proxy phải dùng socks5:// hoặc http:// và có cổng.`);
    }
    return withCredentials(
      `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`,
      proxyUrl.username ? decodeURIComponent(proxyUrl.username) : undefined,
      proxyUrl.password ? decodeURIComponent(proxyUrl.password) : undefined,
    );
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
 * @return {Promise<string>} IP thoát đã xác minh.
 * @throws {IpVerificationError|Error} Khi dịch vụ IP lỗi hoặc IP đã dùng.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
async function verifyBrowserExitIp(browser, usedExitIps, onExitIp) {
  const ipPage = await browser.newPage();
  let exitIp;
  const failures = [];
  try {
    for (const checkUrl of browserIpCheckUrls) {
      try {
        const response = await ipPage.goto(checkUrl, {
          waitUntil: 'domcontentloaded',
          timeout: navigationTimeout,
        });
        if (!response || response.status() < 200 || response.status() >= 300) {
          throw new IpVerificationError(
            `trả HTTP ${response?.status() ?? 'không có phản hồi'}`,
          );
        }
        const ipResponse = JSON.parse(await ipPage.evaluate(() => document.body.innerText));
        if (typeof ipResponse.ip !== 'string' || !ipResponse.ip.trim()) {
          throw new IpVerificationError('không trả địa chỉ IP');
        }
        exitIp = ipResponse.ip.trim();
        break;
      } catch (error) {
        const reason = error instanceof IpVerificationError
          ? error.message
          : 'không kết nối được';
        failures.push(`${new URL(checkUrl).host}: ${reason}`);
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
  if (usedExitIps.has(exitIp)) throw new Error(`IP ${exitIp} đã được dùng trước đây`);
  usedExitIps.add(exitIp);
  return exitIp;
}

/**
 * Sinh khóa ổn định cho proxy, giữ các dòng trùng nhau thành mục lịch sử riêng.
 *
 * @param {object} proxy Cấu hình proxy đã phân tích.
 * @param {number} occurrence Thứ tự xuất hiện của cấu hình giống hệt trong danh sách.
 * @return {string} Khóa băm không chứa thông tin đăng nhập dạng rõ.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
export function createProxyUsageKey(proxy, occurrence) {
  const proxyHash = createHash('sha256').update(proxyIdentity(proxy)).digest('hex');
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
    ['proxy', 'trang_thai', 'ip_exit', 'website', 'url_cuoi', 'profile_id', 'bat_dau', 'ket_thuc', 'ghi_chu']
      .map(csvCell).join(','),
    ...records.map((record) => [
      record.proxy,
      record.status,
      record.exitIp,
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
async function launchRequestedBrowsers(requestBody, { layoutTarget = null } = {}) {
  const body = JSON.parse(requestBody);
  if (templateProfileContext) {
    throw new Error('Hãy đóng cửa sổ profile mẫu RoboForm trước khi tạo profile Chrome mới.');
  }
  const autofillRecords = parseAutofillRecords(body.autofillData);
  const proxyType = body.proxyType ?? 'socks5';
  const inputProxies = selectProxies(body.proxyList, proxyType, '');
  const usageHistory = await readProxyUsageHistory();
  const usedExitIps = new Set(Object.values(usageHistory.proxies).map((entry) => entry.exitIp).filter(Boolean));
  const seenProxyKeys = new Set();
  const availableProxies = inputProxies.filter((proxy) => {
    const proxyKey = createProxyUsageKey(proxy, 1);
    const previousAttempt = usageHistory.proxies[proxyKey];
    const retryable = isRetryableIpVerificationFailure(previousAttempt);
    if (seenProxyKeys.has(proxyKey) || (previousAttempt && !retryable)) return false;
    seenProxyKeys.add(proxyKey);
    return true;
  });
  const requestedCount = body.requestedCount === undefined || body.requestedCount === ''
    ? availableProxies.length
    : Number(body.requestedCount);
  if (!Number.isInteger(requestedCount) || requestedCount < 1) {
    throw new Error('Số trình duyệt cần mở phải là số nguyên lớn hơn 0.');
  }
  if (requestedCount > maxAliveBrowsers) {
    throw new Error('Chỉ được mở tối đa ' + maxAliveBrowsers + ' cửa sổ trình duyệt cùng lúc.');
  }
  const targetSuccessCount = Math.min(requestedCount, availableProxies.length);
  if (targetSuccessCount === 0) {
    return {
      results: [],
      warnings: ['Tất cả proxy trong danh sách đã được thử trước đây hoặc bị trùng; không có proxy mới để mở.'],
    };
  }
  const warnings = requestedCount > availableProxies.length
    ? ['Bạn yêu cầu ' + requestedCount + ' trình duyệt nhưng chỉ còn ' + availableProxies.length + ' proxy chưa dùng.']
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

  const websiteUrl = normalizeUrl(body.websiteUrl);
  const screen = await readScreenSize();
  const layoutCount = layoutTarget ?? Math.min(maxAliveBrowsers, alreadyAlive + targetSuccessCount);
  const occupiedTileIndexes = new Set([...activeBrowsers].map((session) => session.tileIndex));
  const availableTileIndexes = Array.from({ length: layoutCount }, (_, index) => index)
    .filter((index) => !occupiedTileIndexes.has(index));
  const occupiedChromeMajors = new Set([...activeBrowsers]
    .map((session) => Number(session.chromeVersion?.split('.')[0])).filter(Boolean));
  const availableChromeBuilds = (await listInstalledChromeChannels())
    .filter((build) => !occupiedChromeMajors.has(build.major));
  if (availableChromeBuilds.length > 1) {
    const offset = chromeBuildRotationCounter % availableChromeBuilds.length;
    availableChromeBuilds.push(...availableChromeBuilds.splice(0, offset));
  }
  if (availableChromeBuilds.length < targetSuccessCount) {
    throw new Error('Cần ' + targetSuccessCount + ' phiên bản Google Chrome thường khác nhau, '
      + 'nhưng hiện chỉ còn ' + availableChromeBuilds.length + ' phiên bản chưa mở. '
      + 'Hãy cài thêm phiên bản hoặc giảm số cửa sổ.');
  }
  warnings.push('Các phiên bản Google Chrome thường của lượt này: '
    + availableChromeBuilds.slice(0, targetSuccessCount).map((build) => build.version).join(', ') + '.');

  if (!autoRefill.settings) {
    autoRefill.settings = {
      proxyList: body.proxyList,
      proxyType: proxyType,
      websiteUrl: body.websiteUrl,
      autofillData: body.autofillData,
      autoSubmitForm: body.autoSubmitForm !== false,
      enableLeadCheck: body.enableLeadCheck !== false,
      leadCheckApiUrl: body.leadCheckApiUrl,
      leadCheckCookie: body.leadCheckCookie,
      leadCheckDatas: body.leadCheckDatas,
      leadCheckInterval: body.leadCheckInterval,
      leadCheckMaxAttempts: body.leadCheckMaxAttempts,
    };
    if (autoRefill.targetCount < 1) autoRefill.targetCount = targetSuccessCount;
  }
  const results = [];
  let nextProxyIndex = 0;
  let successfulBrowsers = 0;
  let ipVerificationUnavailable = false;

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
    while (!ipVerificationUnavailable
      && successfulBrowsers < targetSuccessCount
      && nextProxyIndex < availableProxies.length) {
      const proxy = availableProxies[nextProxyIndex];
      nextProxyIndex += 1;
      const proxyKey = createProxyUsageKey(proxy, 1);
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
          websiteUrl: websiteUrl,
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
            websiteUrl: websiteUrl,
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
        };
        const openedBrowser = await openBrowserWithInstalledChrome({
          build: installedChrome,
          proxy: proxy,
          proxyKey: proxyKey,
          websiteUrl: websiteUrl,
          usedExitIps: usedExitIps,
          onExitIp: recordExitIp,
          tile: tileAt(tileIndex, layoutCount, screen),
          tileIndex: tileIndex,
          autofillRecords: autofillRecords,
          autoSubmit: body.autoSubmitForm !== false,
          leadConfig,
        });
        activeSession = openedBrowser.session;
        usageHistory.proxies[proxyKey] = {
          status: 'success',
          exitIp: exitIp,
          proxy: proxy.server,
          username: proxy.username ?? '',
          websiteUrl: websiteUrl,
          finalUrl: openedBrowser.finalUrl,
          profileId: browserProfileId,
          attemptedAt: attemptStartedAt,
          completedAt: new Date().toISOString(),
        };
        await persistProxyUsageHistory(usageHistory);
        watchTrafficBlockedPage(activeSession);
        successfulBrowsers += 1;
        results.push('Trình duyệt ' + successfulBrowsers + ' [Google Chrome '
          + installedChrome.version + ']: mở đúng trang đích qua IP ' + exitIp
          + ' (' + proxy.server + ').');
        return;
      } catch (error) {
        failureReason = error.message.split('\n')[0];
        if (activeSession) {
          activeSession.suppressAutoRefill = true;
          await activeSession.browser?.close?.().catch(() => {});
        }
        const verificationFailure = error instanceof IpVerificationError;
        usageHistory.proxies[proxyKey] = {
          status: verificationFailure ? 'verification_error' : 'failed',
          exitIp: exitIp ?? null,
          proxy: proxy.server,
          username: proxy.username ?? '',
          websiteUrl: websiteUrl,
          reason: failureReason,
          attemptedAt: attemptStartedAt,
          completedAt: new Date().toISOString(),
        };
        await persistProxyUsageHistory(usageHistory);
        if (verificationFailure) {
          ipVerificationUnavailable = true;
          autoRefill.enabled = false;
          autoRefill.message = 'Tự bù đã tạm dừng vì dịch vụ xác minh IP không hoạt động.';
          results.push('Proxy ' + proxy.server + ': chưa xác minh được IP; đã giữ proxy để thử lại sau ('
            + failureReason + '). Dừng thử các proxy tiếp theo trong lượt này.');
          continue;
        }
        results.push('Proxy ' + proxy.server + ': loại bỏ IP ' + (exitIp ?? 'chưa xác định')
          + ' — ' + failureReason + '; sẽ thử proxy khác.');
      }
    }
  };

  await Promise.all(Array.from(
    { length: Math.min(maxConcurrentProfiles, targetSuccessCount) },
    (_, workerIndex) => attemptProxy(workerIndex),
  ));

  if (ipVerificationUnavailable) {
    warnings.push('Dịch vụ xác minh IP trả lỗi hoặc dữ liệu không hợp lệ. Proxy bị ảnh hưởng chưa bị '
      + 'đánh dấu hỏng; lượt đã dừng và tự bù đã tạm dừng để tránh tiêu thụ thêm proxy.');
  } else if (successfulBrowsers < targetSuccessCount) {
    warnings.push('Chỉ mở được ' + successfulBrowsers + '/' + targetSuccessCount
      + ' trình duyệt; các proxy còn lại đã hết hoặc không tải đúng trang đích.');
  }
  return { results: results, warnings: warnings };
}

/**
 * Mở profile theo yêu cầu và ghi cấu hình để tự bù các slot bị đóng.
 *
 * @param {string} requestBody Nội dung JSON nhận từ giao diện.
 * @return {Promise<object>} Kết quả mở profile và trạng thái tự bù.
 * @throws {Error} Khi cấu hình launch không hợp lệ.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
async function launchUserRequestedBrowsers(requestBody) {
  const body = JSON.parse(requestBody);
  const activeBeforeLaunch = activeBrowsers.size;
  const result = await launchRequestedBrowsers(requestBody);
  const requestedCount = body.requestedCount === undefined || body.requestedCount === ''
    ? selectProxies(body.proxyList, body.proxyType ?? 'socks5', '').length
    : Number(body.requestedCount);

  if (activeBrowsers.size > 0) {
    autoRefill.settings = {
      proxyList: body.proxyList,
      proxyType: body.proxyType ?? 'socks5',
      websiteUrl: body.websiteUrl,
      autofillData: body.autofillData,
      autoSubmitForm: body.autoSubmitForm !== false,
      enableLeadCheck: body.enableLeadCheck !== false,
      leadCheckApiUrl: body.leadCheckApiUrl,
      leadCheckCookie: body.leadCheckCookie,
      leadCheckDatas: body.leadCheckDatas,
      leadCheckInterval: body.leadCheckInterval,
      leadCheckMaxAttempts: body.leadCheckMaxAttempts,
    };
    autoRefill.targetCount = Math.min(
      maxAliveBrowsers,
      Math.max(autoRefill.targetCount, activeBeforeLaunch + requestedCount, activeBrowsers.size),
    );
    autoRefill.message = `Tự bù ${autoRefill.enabled ? 'đang bật' : 'đang tắt'}: ${activeBrowsers.size}/${autoRefill.targetCount} trình duyệt.`;
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
function queueAutomaticRefill() {
  if (!autoRefill.enabled || !autoRefill.settings || autoRefill.queued) return;
  autoRefill.queued = true;
  void enqueueExclusively(async () => {
    autoRefill.queued = false;
    if (!autoRefill.enabled || !autoRefill.settings) return;

    const neededSlots = Math.min(autoRefill.targetCount, maxAliveBrowsers) - activeBrowsers.size;
    if (neededSlots <= 0) return;

    const activeSettings = autoRefill.settings;
    autoRefill.message = `Đang tìm proxy mới để bù ${neededSlots} slot trống…`;
    const result = await launchRequestedBrowsers(JSON.stringify({
      ...activeSettings,
      requestedCount: neededSlots,
    }), { layoutTarget: autoRefill.targetCount });
    autoRefill.message = activeBrowsers.size >= autoRefill.targetCount
      ? `Đã bù đủ ${activeBrowsers.size}/${autoRefill.targetCount} trình duyệt.`
      : result.warnings.at(-1) ?? `Hiện mở ${activeBrowsers.size}/${autoRefill.targetCount}; không còn proxy phù hợp để bù.`;
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
    activeCount: activeBrowsers.size,
    targetCount: autoRefill.targetCount,
    message: autoRefill.message,
    chromeSessions: [...activeBrowsers]
      .filter((session) => session.chromeVersion && session.exitIp)
      .map((session) => ({
        slot: session.tileIndex + 1,
        version: session.chromeVersion,
        exitIp: session.exitIp,
        proxy: session.proxyServer ?? session.proxyKey ?? null,
        autofillRecord: session.autofillRecord ?? null,
        autofillFields: session.autofillFields ?? 0,
        autofillError: session.autofillError ?? null,
        leadCheckStatus: session.leadCheckStatus ?? null,
        leadCheckMessage: session.leadCheckMessage ?? null,
        extensions: session.extensions ?? null,
      }))
      .sort((firstSession, secondSession) => firstSession.slot - secondSession.slot),
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

  return new Promise((resolve, reject) => {
    const proxyRequest = requestHttps(checkUrl, { agent, timeout: navigationTimeout }, (response) => {
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
    proxyRequest.on('timeout', () => proxyRequest.destroy(new Error(`Timeout sau ${navigationTimeout / 1000} giây.`)));
    proxyRequest.on('error', reject);
  });
}

/**
 * Đóng mọi trình duyệt do app mở.
 *
 * Playwright chạy Chromium với --no-startup-window nên đóng hết cửa sổ không làm tiến
 * trình thoát — nó nằm chờ trên CDP pipe và vẫn hiện icon dưới Dock. Phải gọi close().
 *
 * @return {Promise<{results: string[], warnings: string[]}>} Số trình duyệt đã đóng.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
async function closeActiveBrowsers() {
  const sessions = [...activeBrowsers];
  autoRefill.enabled = false;
  autoRefill.settings = null;
  autoRefill.targetCount = 0;
  autoRefill.message = 'Đã đóng tất cả; tự bù đã tắt.';
  for (const session of sessions) session.suppressAutoRefill = true;
  await Promise.all(sessions.map((session) => Promise.resolve(session.browser.close()).catch(() => {})));
  activeBrowsers.clear();

  return {
    results: [sessions.length > 0
      ? 'Đã đóng ' + sessions.length + ' trình duyệt.'
      : 'Không có trình duyệt nào đang mở.'],
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
    // Kho Chrome for Testing xếp cuối: chỉ dùng khi cần thêm major, và không áp sàn 150
    // vì đây là nguồn duy nhất còn các bản cũ hơn.
    ...(await listInstalledChromeVersions()).map((build) => [
      build.version,
      join(build.executablePath, '..', '..', '..'),
      1,
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
  for (const delayMs of [1500, 2500]) {
    await new Promise((resolve) => { setTimeout(resolve, delayMs); });
    await Promise.all(targets.map((target) => rm(target, { recursive: true, force: true }).catch(() => {})));
    const remaining = await Promise.all(targets.map((target) => access(target).then(() => true, () => false)));
    if (!remaining.includes(true)) return;
  }
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
 * Bắt đầu quy trình kiểm tra lead sau khi autofill hoàn thành màn đầu tiên.
 * Chờ mỗi 30s gọi API toffers.top kiểm tra IP sock, tối đa 2 lần.
 * Nếu IP xuất hiện: cho phép autofill tiếp tục các màn sau.
 * Nếu không xuất hiện sau 2 lần: đóng Chrome và chuyển proxy tiếp theo cho đến khi hết sock.
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
  session.leadCheckStatus = 'waiting';

  const exitIp = session.exitIp;
  const proxyHost = session.proxyServer ? normalizeIpAddress(session.proxyServer) : null;
  const targetIps = [exitIp, proxyHost].filter(Boolean);
  const slotNum = (session.tileIndex ?? 0) + 1;
  const label = `Slot ${slotNum} [IP: ${exitIp}]`;

  console.log(`[LeadCheck] ${label}: Đã xong màn 1. Bắt đầu dừng chờ kiểm tra lead từ toffers.top...`);

  const updateBadge = (text) => {
    try {
      if (session.browser?.pages) {
        for (const p of session.browser.pages()) {
          if (!p.isClosed()) {
            p.evaluate((t) => {
              const b = document.getElementById('__autolead_ip_badge');
              if (b) b.innerHTML = t;
            }, text).catch(() => {});
          }
        }
      }
    } catch {}
  };

  const intervalSeconds = leadConfig.intervalSeconds || DEFAULT_LEAD_CONFIG.intervalSeconds;
  const maxAttempts = leadConfig.maxAttempts || DEFAULT_LEAD_CONFIG.maxAttempts;
  const intervalMs = intervalSeconds * 1000;

  session.leadCheckMessage = `Đã xong màn 1; đang dừng chờ ${intervalSeconds}s để kiểm tra lead lần 1...`;
  updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⏳ Đang chờ lead (lần 1/${maxAttempts})...</span>`);

  let leadFound = false;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt += 1;
    // Chờ 30 giây (hoặc intervalMs)
    await new Promise((resolve) => { setTimeout(resolve, intervalMs); });

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
        console.log(`[LeadCheck] ${label}: ✅ Tìm thấy lead cho IP ${exitIp} ở lần ${attempt}! Tiếp tục fill màn sau.`);
        break;
      } else {
        console.log(`[LeadCheck] ${label}: ⚠️ Chưa thấy IP ${exitIp} trong dữ liệu lead (lần ${attempt}/${maxAttempts}).`);
        if (attempt < maxAttempts) {
          session.leadCheckMessage = `Chưa có lead lần ${attempt}; chờ tiếp ${intervalSeconds}s để kiểm tra lần ${attempt + 1}...`;
          updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#f59e0b;">⏳ Đang chờ lead (lần ${attempt + 1}/${maxAttempts})...</span>`);
        }
      }
    } catch (err) {
      console.error(`[LeadCheck] ${label}: Lỗi khi gọi API kiểm tra lead: ${err.message}`);
      session.leadCheckMessage = `Lỗi gọi API: ${err.message.split('\n')[0]}; đang thử lại...`;
    }
  }

  if (leadFound) {
    session.leadCheckStatus = 'confirmed';
    session.leadCheckMessage = `✅ Đã có lead về cho IP ${exitIp}! Đang tiếp tục tự điền các màn sau.`;
    updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#22c55e;">✅ Có lead về!</span>`);

    const logs = browserSessionLogs.get(session);
    if (logs) {
      logs.push({
        time: new Date().toISOString(),
        type: 'lead_confirmed',
        ip: exitIp,
        detail: `Đã xác nhận có lead trên toffers.top ở lần kiểm tra thứ ${attempt}.`,
      });
    }

    // Kích hoạt ngay lượt quét autofill tiếp theo để điền màn 2 tức thì
    try {
      session.triggerAutofillScan?.();
    } catch {}
  } else {
    session.leadCheckStatus = 'failed';
    session.closingDueToNoLead = true;
    session.leadCheckMessage = `❌ Không có lead về cho IP ${exitIp} sau ${maxAttempts} lần kiểm tra (${maxAttempts * intervalSeconds}s). Đang đổi sock và mở phiên bản mới...`;
    updateBadge(`🌐 <strong>IP:</strong> ${exitIp} | <span style="color:#ef4444;">❌ Không có lead, đang đổi phiên bản mới...</span>`);

    console.log(`[LeadCheck] ${label}: ❌ Không có lead sau ${maxAttempts} lần kiểm tra. Đóng Chrome này để mở phiên bản mới.`);

    try {
      if (session.proxyKey) {
        const history = await readProxyUsageHistory();
        if (history?.proxies?.[session.proxyKey]) {
          history.proxies[session.proxyKey] = {
            ...history.proxies[session.proxyKey],
            status: 'failed',
            reason: `Không có lead về sau ${maxAttempts} lần kiểm tra (IP ${exitIp})`,
            completedAt: new Date().toISOString(),
          };
          await persistProxyUsageHistory(history);
        }
      }
    } catch {}

    chromeBuildRotationCounter += 1;
    autoRefill.message = `Slot ${slotNum} (IP ${exitIp}) không có lead về; đã đóng và đang mở phiên bản mới với sock tiếp theo…`;
    session.suppressAutoRefill = false;
    await session.browser?.close?.().catch(() => {});
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
  build, proxy, proxyKey, websiteUrl, usedExitIps, onExitIp, tile, tileIndex, autofillRecords, autoSubmit = true, leadConfig = {},
}) {
  const userDataDirectory = join(chromeProfileDirectory, build.channel, build.version, proxyKey);
  const templateSkipReason = await seedChromeProfileFromTemplate(userDataDirectory, build);
  const extensionNames = await listProfileExtensionNames(userDataDirectory);
  await mkdir(userDataDirectory, { recursive: true, mode: 0o700 });

  let timezoneId;
  try {
    const ipInfo = await requestProxyIpInfo(proxy);
    if (typeof ipInfo.timezone === 'string' && ipInfo.timezone.includes('/')) timezoneId = ipInfo.timezone;
  } catch {
    // Không tra được múi giờ không chặn việc xác minh IP trong trình duyệt.
  }

  const relay = proxy.server.startsWith('socks5://') && proxy.username
    ? await startAuthenticatedSocksRelay(proxy)
    : null;
  let context;
  try {
    // viewport: null để cửa sổ thật quyết định khung nhìn.
    context = await chromium.launchPersistentContext(userDataDirectory, {
      executablePath: build.executablePath,
      ignoreDefaultArgs: ['--disable-extensions', '--disable-background-networking', '--disable-component-update'],
      headless: false,
      viewport: null,
      userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 `
        + `(KHTML, like Gecko) Chrome/${build.version} Safari/537.36`,
      proxy: relay?.proxy ?? toPlaywrightProxy(proxy),
      ...(timezoneId && { timezoneId }),
      args: [
        `--window-position=${tile.left},${tile.top}`,
        `--window-size=${tile.width},${tile.height}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
  } catch (error) {
    await relay?.close();
    throw error;
  }
  const session = {
    browser: context,
    tileIndex,
    chromeVersion: build.version,
    suppressAutoRefill: false,
    proxyKey,
    proxyServer: proxy.server,
    leadCheckStatus: null,
    leadCheckMessage: null,
    extensions: extensionNames.length > 0
      ? extensionNames.join(', ')
      : `không có (${templateSkipReason ?? 'profile mẫu chưa cài extension nào'})`,
  };
  attachBrowserLogger(context, session);
  // Lọc các bản ghi chưa dùng; nếu hết thì dùng lại toàn bộ (reset tự động)
  const unusedRecords = autofillRecords.filter((r) => !autofillUsedKeys.has(autofillRecordKey(r)));
  const recordPool = unusedRecords.length > 0 ? unusedRecords : autofillRecords;
  attachAutofill(context, recordPool, new URL(websiteUrl).origin, session, {
    autoSubmit,
    enableLeadCheck: leadConfig.enabled !== false,
    onRecordPicked: (record) => { void markAutofillRecordUsed(record); },
    onFirstScreenCompleted: () => {
      void startLeadVerification(session, leadConfig);
    },
  });
  activeBrowsers.add(session);

  context.on('close', () => {
    activeBrowsers.delete(session);
    void relay?.close();
    // Profile dùng xong là xoá cả profile và cache: không giữ lại ~179 MB mỗi proxy đã thử.
    void removeChromeSessionProfile(userDataDirectory);
    if (!session.suppressAutoRefill) {
      if (!session.closingDueToTrafficBlocked) {
        autoRefill.message = `Slot ${tileIndex + 1} trống; đang tìm proxy thay thế.`;
      }
      queueAutomaticRefill();
    }
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    const exitIp = await verifyBrowserExitIp(context, usedExitIps, onExitIp);
    session.exitIp = exitIp;
    const response = await page.goto(websiteUrl, { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
    const finalUrl = page.url();
    if (!response || response.status() >= 400) {
      throw new Error(`website trả HTTP ${response?.status() ?? 'không có phản hồi'}`);
    }
    if (await hasTrafficBlocked(page)) {
      throw new Error('trang đích hiển thị Traffic Blocked!');
    }
    await page.bringToFront().catch(() => {});

    // Đặt tiền tố IP vào tiêu đề trang và gắn badge để khi hover vào icon Chrome trên Dock/tab/web đều thấy IP
    await page.evaluate((ip) => {
      const prefix = `[IP: ${ip}] `;
      if (document.title && !document.title.startsWith(prefix)) {
        document.title = prefix + document.title;
      } else if (!document.title) {
        document.title = prefix;
      }
      try {
        if (!document.getElementById('__autolead_ip_badge')) {
          const badge = document.createElement('div');
          badge.id = '__autolead_ip_badge';
          badge.innerHTML = `🌐 <strong>IP:</strong> ${ip}`;
          badge.title = `Chrome Session IP: ${ip}\nAutoLeadPC`;
          badge.style.cssText = 'position:fixed;top:8px;right:12px;z-index:2147483647;'
            + 'background:rgba(26,38,57,0.92);color:#fff;padding:4px 10px;border-radius:14px;'
            + 'font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;line-height:1.4;'
            + 'box-shadow:0 2px 8px rgba(0,0,0,0.25);pointer-events:auto;user-select:none;'
            + 'cursor:pointer;transition:all 0.2s;';
          badge.onmouseenter = () => { badge.style.opacity = '1'; badge.style.transform = 'scale(1.05)'; };
          badge.onmouseleave = () => { badge.style.opacity = '0.75'; badge.style.transform = 'scale(1)'; };
          badge.style.opacity = '0.85';
          document.documentElement.appendChild(badge);
        }
      } catch {}
    }, exitIp).catch(() => {});

    context.on('page', (newPage) => {
      newPage.on('domcontentloaded', () => {
        newPage.evaluate((ip) => {
          const prefix = `[IP: ${ip}] `;
          if (document.title && !document.title.startsWith(prefix)) {
            document.title = prefix + document.title;
          }
        }, exitIp).catch(() => {});
      });
    });

    closeChromeWhenLastTabCloses(session);
    return { exitIp, finalUrl, session };
  } catch (error) {
    session.suppressAutoRefill = true;
    await context.close().catch(() => {});
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
    session.suppressAutoRefill = true;
    autoRefill.targetCount = Math.max(0, Math.min(autoRefill.targetCount, activeBrowsers.size - 1));
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
 * Log được giữ tối đa 500 mục, tự dọn 60 giây sau khi phiên đóng.
 *
 * @param {object} context Playwright BrowserContext.
 * @param {object} session Phiên Chrome hiện tại.
 */
function attachBrowserLogger(context, session) {
  const logs = [];
  browserSessionLogs.set(session, logs);

  function addLog(entry) {
    logs.push({ time: new Date().toISOString(), ...entry });
    // ponytail: giữ 500 mục gần nhất; nâng lên nếu cần nhiều hơn
    if (logs.length > 500) logs.splice(0, logs.length - 500);
  }

  // Tiêm listener click vào mọi trang (kể cả trang mở sau)
  context.exposeFunction('__alpc_log', addLog).catch(() => {});
  context.addInitScript(() => {
    document.addEventListener('click', (e) => {
      const el = e.target;
      window.__alpc_log({
        type: 'click',
        tag: el.tagName,
        id: el.id || null,
        text: (el.innerText || el.value || '').trim().slice(0, 120),
        href: el.href || el.closest?.('a')?.href || null,
      });
    }, { capture: true });
  }).catch(() => {});

  // Ghi nhận điều hướng + chụp HTML (tối đa 64 KB)
  function hookPage(page) {
    page.on('framenavigated', async (frame) => {
      if (frame !== page.mainFrame()) return;
      const url = frame.url();
      if (!url || url === 'about:blank') return;
      let html = '';
      let title = '';
      try { html = (await page.content()).slice(0, 65536); } catch {}
      try { title = await page.title(); } catch {}
      addLog({ type: 'navigate', url, title, html });
    });
  }

  context.on('page', hookPage);
  for (const page of context.pages()) hookPage(page);

  context.on('close', () => {
    setTimeout(() => browserSessionLogs.delete(session), 60_000);
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
export async function hasTrafficBlocked(page) {
  try {
    if (!page || (typeof page.isClosed === 'function' && page.isClosed())) return false;
    const evaluatePromise = page.evaluate(() => {
      const title = document.title || '';
      const bodyText = document.body ? (document.body.innerText || document.body.textContent || '') : '';
      const docText = document.documentElement ? (document.documentElement.innerText || document.documentElement.textContent || '') : '';
      const fullText = `${title} ${bodyText} ${docText}`;
      return /traffic\s+blocked/i.test(fullText);
    });
    const timeoutPromise = new Promise((resolve) => {
      const timeoutId = setTimeout(() => resolve(false), 2000);
      timeoutId.unref?.();
    });
    return Boolean(await Promise.race([evaluatePromise, timeoutPromise]));
  } catch {
    return false;
  }
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
  let checking = false;
  let blocked = false;
  const timer = setInterval(() => {
    if (checking || blocked) return;
    checking = true;
    void (async () => {
      try {
        const pages = typeof session.browser?.pages === 'function'
          ? await session.browser.pages()
          : [];
        for (const page of pages) {
          if (typeof page?.isClosed === 'function' && page.isClosed()) continue;
          if (await hasTrafficBlocked(page)) {
            blocked = true;
            clearInterval(timer);
            session.closingDueToTrafficBlocked = true;
            session.suppressAutoRefill = false;
            autoRefill.enabled = true;

            try {
              if (session.proxyKey) {
                const history = await readProxyUsageHistory();
                if (history?.proxies?.[session.proxyKey]) {
                  history.proxies[session.proxyKey] = {
                    ...history.proxies[session.proxyKey],
                    status: 'failed',
                    reason: 'Traffic Blocked!',
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

            autoRefill.message = `${label} (IP ${session.exitIp ?? 'chưa rõ'}) hiển thị Traffic Blocked!; `
              + 'đã đóng cửa sổ và đang tự động mở IP khác thay thế…';

            await page.close().catch(() => {});
            await session.browser?.close?.().catch(() => {});
            queueAutomaticRefill();
            break;
          }
        }
      } catch {
        // Tab có thể đóng hoặc chuyển trang trong lúc kiểm tra.
      } finally {
        checking = false;
      }
    })();
  }, 1500);
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

/**
 * Khởi động giao diện cục bộ và mở nó trong trình duyệt mặc định của macOS.
 *
 * @return {Promise<void>} Hoàn tất khi giao diện được mở.
 * @throws {Error} Khi máy chủ giao diện không thể lắng nghe cổng cục bộ.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-15
 */
async function startLocalInterface() {
  await loadAutofillUsed();
  const interfaceHtml = await readFile(userInterfacePath, 'utf8');
  const handlers = {
    '/launch': runExclusively(launchUserRequestedBrowsers),
    '/check': checkRequestedProxies,
    '/close': runExclusively(closeActiveBrowsers),
    '/auto-refill': updateAutoRefill,
    '/used-ips': listUsedExitIps,
    '/used-ips/clear': runExclusively(clearUsedProxyHistory),
    '/chrome-versions/download': runExclusively(downloadRealChromeVersions),
    '/template-profile/open': runExclusively(openTemplateProfile),
  };

  const server = createServer(async (request, response) => {
    if (request.method === 'GET' && request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      response.end(interfaceHtml);
      return;
    }

    if (request.method === 'GET' && request.url === '/state') {
      respondWithJson(response, 200, getAutoRefillStatus());
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

    if (request.method === 'GET' && request.url === '/browser-logs') {
      const result = [];
      for (const [s, logs] of browserSessionLogs) {
        result.push({
          slot: s.tileIndex + 1,
          ip: s.exitIp ?? '?',
          version: s.chromeVersion,
          logs,
        });
      }
      respondWithJson(response, 200, result);
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

  server.listen(port, '127.0.0.1', async () => {
    const interfaceUrl = `http://127.0.0.1:${port}`;
    console.log(`AutoLeadPC Mac đang chạy tại ${interfaceUrl}`);
    exitWhenParentExits();
    if (process.env.AUTOLEADPC_NO_OPEN === '1') return;
    try {
      await executeFile('open', [interfaceUrl]);
    } catch {
      console.log(`Mở URL này trong trình duyệt: ${interfaceUrl}`);
    }
  });
}

if (import.meta.main) {
  startLocalInterface().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
