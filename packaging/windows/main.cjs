const { app, BrowserWindow, dialog, shell, session, Tray, Menu, nativeImage, clipboard } = require('electron');
const { spawn } = require('node:child_process');
const { join, dirname } = require('node:path');
const { mkdirSync, createWriteStream, existsSync } = require('node:fs');
const net = require('node:net');
const { importBundledSettings } = require('./import-bundled-settings.cjs');
const { setWindowsServerStartup, createWindowsServerTray } = require('./server-control.cjs');

let backend;
let mainWindow;
let serverTray;
let quitting = false;
let shutdownComplete = false;
const port = Number(process.env.AUTOLEADPC_PORT || 3211);
const interfaceUrl = `http://127.0.0.1:${port}`;
const serverMode = process.argv.includes('--server');
const applicationDataDirectory = join(app.getPath('appData'), process.env.AUTOLEADPC_DATA_DIR || 'AutoLeadPC-2');
mkdirSync(join(applicationDataDirectory, 'interface'), { recursive: true });
app.setPath('userData', join(applicationDataDirectory, 'interface'));

/**
 * Chỉ cho phép cửa sổ chính điều hướng tới giao diện cục bộ của ứng dụng.
 * @param {string} address Địa chỉ muốn mở.
 * @return {boolean} True nếu cùng origin của backend.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function isLocalInterface(address) {
  try { return new URL(address).origin === interfaceUrl; } catch { return false; }
}

/**
 * Hiện cửa sổ đang chạy từ biểu tượng tray hoặc lần mở app thứ hai.
 * @return {void} Cửa sổ chính đã hiện và được focus nếu sẵn sàng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

/**
 * Áp dụng lệnh bật/gỡ autorun, kể cả khi server đã chạy và nhận lần mở thứ hai.
 * @param {string[]} argumentsList Tham số của tiến trình yêu cầu.
 * @return {boolean} True khi chỉ gỡ autorun và không cần mở backend mới.
 * @throws {Error} Khi Windows từ chối cập nhật Startup.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function configureStartupFromArguments(argumentsList) {
  if (argumentsList.includes('--install-startup')) setWindowsServerStartup(app, true);
  if (argumentsList.includes('--remove-startup')) {
    setWindowsServerStartup(app, false);
    dialog.showMessageBoxSync({ type: 'info', message: 'Đã gỡ tự khởi động AutoLeadPC Server. Server đang chạy được giữ nguyên.' });
    return true;
  }
  return false;
}

/**
 * Kiểm tra cổng trước khi khởi động để không nối nhầm hoặc dừng backend đang làm việc.
 * @return {Promise<void>} Cổng có thể sử dụng.
 * @throws {Error} Khi cổng đã bị chiếm.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function checkInterfacePort() {
  await new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(port, '127.0.0.1', () => probe.close(resolve));
  });
}

/**
 * Chờ backend riêng sẵn sàng trước khi tải giao diện.
 * @return {Promise<void>} Backend đã trả giao diện.
 * @throws {Error} Khi backend thoát sớm hoặc hết thời gian khởi động.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function waitForBackend() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (backend.exitCode !== null || backend.signalCode !== null) throw new Error('Backend đã dừng. Xem backend.log trong thư mục dữ liệu.');
    try {
      const response = await fetch(`${interfaceUrl}/pc`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('Backend chưa sẵn sàng sau 60 giây. Xem backend.log trong thư mục dữ liệu.');
}

/**
 * Mở giao diện Windows, khởi động Node độc lập và lưu mọi dữ liệu ngoài thư mục cài đặt.
 * @return {Promise<void>} Cửa sổ đã tải giao diện.
 * @throws {Error} Khi runtime hoặc backend không khởi động được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function startWindowsApp() {
  if (configureStartupFromArguments(process.argv)) { app.quit(); return; }
  await checkInterfacePort();
  const customConfigDirectory = join(app.getPath('home'), '.autoleadpc');
  importBundledSettings(join(process.resourcesPath, 'private-settings'), applicationDataDirectory, existsSync(customConfigDirectory) ? customConfigDirectory : join(app.getPath('downloads'), 'AutoLeadPC'));
  const runtimeDirectory = app.isPackaged ? join(process.resourcesPath, 'backend') : join(__dirname, '../../.windows-build/backend');
  const nodeExecutable = join(runtimeDirectory, 'runtime-node', 'node.exe');
  const bundledChromeExecutable = join(process.resourcesPath, 'browser', 'chrome-win64', 'chrome.exe');
  const dataDirectory = applicationDataDirectory;
  mkdirSync(dataDirectory, { recursive: true });
  const log = createWriteStream(join(dataDirectory, 'backend.log'), { flags: 'a' });
  const allowLan = process.env.AUTOLEADPC_ALLOW_LAN === '1' || serverMode && process.env.AUTOLEADPC_ALLOW_LAN !== '0';
  backend = spawn(nodeExecutable, [join(runtimeDirectory, 'app.mjs'), ...(allowLan ? ['--public'] : [])], {
    cwd: runtimeDirectory,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    env: { ...process.env, AUTOLEADPC_DISABLE_TUNNEL: serverMode ? '1' : process.env.AUTOLEADPC_DISABLE_TUNNEL, AUTOLEADPC_CHROME_APP: process.env.AUTOLEADPC_CHROME_APP || (existsSync(bundledChromeExecutable) ? bundledChromeExecutable : undefined), AUTOLEADPC_NO_OPEN: '1', AUTOLEADPC_INSTANCE: '2', AUTOLEADPC_PORT: String(port), AUTOLEADPC_DATA_DIR: process.env.AUTOLEADPC_DATA_DIR || 'AutoLeadPC-2', PATH: `${dirname(nodeExecutable)};${process.env.PATH || ''}` }
  });
  backend.stdout.pipe(log, { end: false });
  backend.stderr.pipe(log, { end: false });
  backend.once('error', error => { dialog.showErrorBox('Không mở được AutoLeadPC', error.message); app.quit(); });
  backend.once('exit', () => {
    log.end();
    if (!quitting) { dialog.showErrorBox('AutoLeadPC đã dừng', `Xem nhật ký tại ${join(dataDirectory, 'backend.log')}`); app.quit(); }
  });
  await waitForBackend();
  mainWindow = new BrowserWindow({ width: 1440, height: 940, minWidth: 900, minHeight: 600, title: 'AutoLeadPC', show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isLocalInterface(url) || url.startsWith('devtools://')) return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } } };
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isLocalInterface(url)) { event.preventDefault(); if (/^https?:/.test(url)) void shell.openExternal(url); }
  });
  session.defaultSession.on('will-download', (_event, item) => { item.setSaveDialogOptions({ title: 'Lưu tệp AutoLeadPC' }); });
  if (serverMode) {
    serverTray = createWindowsServerTray({ app, Tray, Menu, nativeImage, clipboard, dialog, port, iconPath: join(runtimeDirectory, 'pc-app.png'), showWindow: showMainWindow });
    mainWindow.on('close', event => { if (!quitting) { event.preventDefault(); mainWindow.hide(); } });
  }
  mainWindow.once('ready-to-show', () => { if (!serverMode) mainWindow.show(); });
  await mainWindow.loadURL(`${interfaceUrl}/pc`);
  if (process.env.AUTOLEADPC_WINDOWS_SMOKE === '1') {
    const ready = await mainWindow.webContents.executeJavaScript("Boolean(document.querySelector('body') && typeof api === 'function')");
    if (!ready) throw new Error('Giao diện chưa nạp đủ JavaScript.');
    app.quit();
  }
}

/**
 * Yêu cầu backend dọn phiên qua IPC; chỉ buộc dừng đúng cây tiến trình sau thời gian chờ.
 * @return {Promise<void>} Backend đã thoát.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function stopWindowsBackend() {
  if (!backend?.pid || backend.exitCode !== null || backend.signalCode !== null) return;
  await new Promise(resolve => {
    const timer = setTimeout(() => {
      const terminator = spawn('taskkill.exe', ['/PID', String(backend.pid), '/T', '/F'], { windowsHide: true });
      terminator.once('error', resolve);
      terminator.once('exit', resolve);
    }, 40000);
    backend.once('exit', () => { clearTimeout(timer); resolve(); });
    if (backend.connected) backend.send('autoleadpc:shutdown', () => {});
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argumentsList) => {
    try { if (configureStartupFromArguments(argumentsList)) return; } catch (error) { dialog.showErrorBox('Không cập nhật được Startup', error.message); return; }
    if (argumentsList.includes('--server') && !serverMode) {
      void dialog.showMessageBox({ type: 'info', message: 'App đang chạy ở chế độ cửa sổ. Hãy thoát app hiện tại rồi chạy Bat-Server.cmd để bật server LAN.' });
    }
    showMainWindow();
  });
  app.on('window-all-closed', () => { if (!serverMode) app.quit(); });
  app.on('before-quit', event => {
    if (shutdownComplete) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void stopWindowsBackend().finally(() => { shutdownComplete = true; app.quit(); });
  });
  app.whenReady().then(startWindowsApp).catch(error => { dialog.showErrorBox('Không mở được AutoLeadPC', error.message); process.exitCode = 1; app.quit(); });
}
