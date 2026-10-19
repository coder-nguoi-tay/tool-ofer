import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCAL_PROFILES_DIR = join(homedir(), '.autoleadpc', 'Profiles');

/**
 * Tìm thư mục zero_profile template được trích xuất từ bản AutoLeadPC PC gốc.
 *
 * @return {string|null} Đường dẫn thư mục template hoặc null nếu chưa có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function resolveZeroProfileTemplate() {
  const candidates = [
    join(__dirname, 'Config', 'Browser', 'zero_profile'),
    join(homedir(), '.autoleadpc', 'Config', 'Browser', 'zero_profile'),
    join(homedir(), 'Downloads', 'AutoLeadPC', 'Config', 'Browser', 'zero_profile-extracted'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'Default', 'Preferences'))) return c;
  }
  return null;
}

/**
 * Sao chép thư mục đệ quy sang vị trí mới.
 *
 * @param {string} source Thư mục nguồn.
 * @param {string} destination Thư mục đích.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function copyRecursive(source, destination) {
  await mkdir(destination, { recursive: true, mode: 0o700 });
  await cp(source, destination, { recursive: true });
}

/**
 * Tìm executable trình duyệt Chrome/Chromium có sẵn trên macOS.
 *
 * @return {string|null} Đường dẫn thực thi hoặc null nếu không có.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function resolveBrowserExecutable() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    join(homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
  ];
  for (const bin of candidates) {
    if (existsSync(bin)) return bin;
  }
  return null;
}

/**
 * Chuẩn bị một profile cục bộ cô lập dựa trên template zero_profile của bản PC gốc,
 * cập nhật Preferences, Bookmarks và cấu hình orbita.config.
 *
 * @param {object} options Tham số luồng (slot, proxy, locale, languages, bookmarks).
 * @return {Promise<string>} Đường dẫn thư mục profile cục bộ đã khởi tạo.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function prepareLocalZeroProfile({ slot = 1, locale = 'en-US', languages = ['en-US', 'en'], bookmarks = [] } = {}) {
  await mkdir(LOCAL_PROFILES_DIR, { recursive: true, mode: 0o700 });
  const uniqueId = `gologin_${Date.now()}_slot_${slot}_${Math.random().toString(36).slice(2, 7)}`;
  const templateDir = resolveZeroProfileTemplate();
  if (!templateDir) throw new Error('Thiếu Config/Browser/zero_profile/Default/Preferences để tạo profile theo bản PC gốc.');
  const profilePath = join(LOCAL_PROFILES_DIR, uniqueId);
  await copyRecursive(templateDir, profilePath);

  // Ghi orbita.config giống hệt bản PC gốc
  const orbitaConfig = {
    intl: {
      accept_languages: languages.join(','),
      selected_languages: languages.join(','),
      app_locale: locale,
      forced_languages: [locale],
    },
  };
  await writeFile(join(profilePath, 'orbita.config'), JSON.stringify(orbitaConfig, null, 2), 'utf8');

  // Chỉnh sửa Preferences của Chromium (sub_18002b250 trong Security.dll)
  const prefsPath = join(profilePath, 'Default', 'Preferences');
  let prefs = {};
  if (existsSync(prefsPath)) {
    try {
      prefs = JSON.parse(await readFile(prefsPath, 'utf8'));
    } catch {
      prefs = {};
    }
  }

  prefs.intl = {
    ...prefs.intl,
    accept_languages: languages.join(','),
    app_locale: locale,
    selected_languages: languages.join(','),
  };
  prefs.bookmark_bar = { ...prefs.bookmark_bar, editing_enabled: true, show_on_all_tabs: true };
  prefs.credentials_enable_service = false;
  prefs.history = { ...prefs.history, saving_disabled: false };
  prefs.profile = { ...prefs.profile, password_manager_enabled: false };

  await writeFile(prefsPath, JSON.stringify(prefs, null, 2), 'utf8');

  // Chỉnh sửa Bookmarks nếu có (sub_180030f40 trong Security.dll)
  if (Array.isArray(bookmarks) && bookmarks.length > 0) {
    const bookmarksPath = join(profilePath, 'Default', 'Bookmarks');
    const bookmarkEntries = bookmarks.map((b, i) => ({
      date_added: String(Date.now() * 1000 + i),
      id: String(i + 1),
      name: b.name || b.title || b.url,
      type: 'url',
      url: b.url || b,
    }));
    const bookmarksData = {
      checksum: '',
      roots: {
        bookmark_bar: {
          children: bookmarkEntries,
          date_added: '13200000000000000',
          date_modified: '13200000000000000',
          id: '1',
          name: 'Bookmarks bar',
          type: 'folder',
        },
        other: { children: [], id: '2', name: 'Other bookmarks', type: 'folder' },
        synced: { children: [], id: '3', name: 'Mobile bookmarks', type: 'folder' },
      },
      version: 1,
    };
    await writeFile(bookmarksPath, JSON.stringify(bookmarksData, null, 2), 'utf8');
  }

  return profilePath;
}

/**
 * Ghép danh sách command line flags khởi động trình duyệt mô phỏng chính xác
 * luồng native của Security.dll (sub_180028180).
 *
 * @param {object} options Tham số (profilePath, proxyUrl, tile, locale).
 * @return {string[]} Danh sách cờ dòng lệnh cho trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export function buildLocalBrowserArgs({ profilePath, proxyUrl = null, tile = null, locale = 'en-US', headless = false }) {
  const args = [
    '--remote-debugging-port=0',
    `--user-data-dir=${profilePath}`,
    `--lang=${locale}`,
    '--restore-last-session',
    '--disable-blink-features=AutomationControlled',
    '--disable-encryption',
    '--disable-backgrounding-occluded-windows',
    '--donut-pie=undefined',
    `--webrtc-ip-handling-policy=${proxyUrl ? 'disable_non_proxied_udp' : 'default_public_interface_only'}`,
    '--component-updater=fast-update,initial-delay=0.1',
    '--disable-features=PrintCompositorLPAC',
    '--font-masking-mode=1',
    '--no-first-run',
    '--no-default-browser-check',
  ];

  if (headless) {
    args.push('--headless=new');
    args.push('--window-size=1280,800');
  } else if (tile) {
    args.push(`--window-position=${tile.left},${tile.top}`);
    args.push(`--window-size=${tile.width},${tile.height}`);
  }

  if (proxyUrl) {
    args.push(`--proxy-server=${proxyUrl}`);
  }

  return args;
}

/**
 * Đợi và đọc tệp DevToolsActivePort để trích xuất cổng dynamic và wsUrl (sub_180028180).
 *
 * @param {string} profilePath Đường dẫn thư mục profile trình duyệt.
 * @param {number} timeoutMs Thời gian chờ tối đa (ms).
 * @return {Promise<string>} URL websocket CDP (ws://127.0.0.1:port/...).
 * @throws {Error} Khi quá thời gian chờ mà file DevToolsActivePort chưa xuất hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function waitForDevToolsActivePort(profilePath, timeoutMs = 15000) {
  const portFile = join(profilePath, 'DevToolsActivePort');
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(portFile)) {
      try {
        const content = await readFile(portFile, 'utf8');
        const lines = content.trim().split(/\r?\n/);
        if (lines.length >= 2 && lines[0] && lines[1]) {
          return `ws://127.0.0.1:${lines[0]}${lines[1]}`;
        }
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Quá thời gian ${timeoutMs / 1000}s chờ trình duyệt sinh DevToolsActivePort tại ${profilePath}`);
}

/**
 * Khởi tạo tiến trình trình duyệt độc lập với profile cục bộ, trả về wsUrl để Playwright kết nối.
 *
 * @param {object} options Cấu hình profile, proxy, tile, locale, executable và headless.
 * @return {Promise<{proc: object, wsUrl: string, profilePath: string}>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function spawnLocalProfileBrowser({ profilePath, proxyUrl = null, tile = null, locale = 'en-US', executablePath = null, headless = false }) {
  const bin = executablePath || resolveBrowserExecutable();
  if (!bin) throw new Error('Không tìm thấy Google Chrome hoặc Chromium trên máy để khởi chạy profile cục bộ.');

  const args = buildLocalBrowserArgs({ profilePath, proxyUrl, tile, locale, headless });
  const proc = spawn(bin, args, { stdio: 'ignore', detached: false });

  proc.on('error', (err) => {
    console.error('[LocalProfileEngine] Lỗi tiến trình trình duyệt:', err.message);
  });

  try {
    const wsUrl = await Promise.race([
      waitForDevToolsActivePort(profilePath, 15000),
      new Promise((_, reject) => {
        proc.once('error', reject);
        proc.once('exit', (code) => reject(new Error(`Trình duyệt đóng trước khi mở CDP (mã ${code}).`)));
      }),
    ]);
    return { proc, wsUrl, profilePath };
  } catch (error) {
    proc.kill('SIGTERM');
    throw error;
  }
}

/**
 * Dừng trình duyệt và đợi tiến trình thoát trước khi xóa profile tạm.
 *
 * @param {import('node:child_process').ChildProcess} browserProcess Tiến trình Chrome của profile.
 * @param {string} profilePath Thư mục profile cần dọn.
 * @return {Promise<void>} Hoàn tất sau khi tiến trình thoát và profile được xóa.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function stopLocalProfileBrowser(browserProcess, profilePath) {
  if (browserProcess && browserProcess.exitCode === null) {
    if (!browserProcess.killed) browserProcess.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => browserProcess.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
    if (browserProcess.exitCode === null) browserProcess.kill('SIGKILL');
  }
  await cleanupLocalProfile(profilePath);
}

/**
 * Dọn dẹp hoàn toàn thư mục profile cục bộ tạm khi phiên kết thúc.
 *
 * @param {string} profilePath Đường dẫn thư mục profile.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-10-19
 */
export async function cleanupLocalProfile(profilePath) {
  if (!profilePath || !profilePath.includes('.autoleadpc/Profiles/gologin_')) return;
  try {
    await rm(profilePath, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[LocalProfileEngine] Không xóa được thư mục tạm ${profilePath}:`, err.message);
  }
}
