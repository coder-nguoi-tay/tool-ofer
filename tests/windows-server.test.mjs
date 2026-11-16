import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const executeFile = promisify(execFile);
const { windowsServerStartupOptions, setWindowsServerStartup, windowsServerAddresses } = require('../packaging/windows/server-control.cjs');

/**
 * Chạy wrapper Electron bằng cửa sổ, backend và Startup giả, không mở browser hay sửa Windows.
 * @param {string[]} [argumentsList=[]] Tham số khởi chạy app.
 * @return {Promise<object>} Các tài nguyên giả để kiểm tra vòng đời server.
 * @throws {Error} Khi wrapper lỗi lúc khởi động.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function runWindowsWrapper(argumentsList = []) {
  const app = new EventEmitter();
  const launches = [];
  const windows = [];
  const trays = [];
  const startupChanges = [];
  const messages = [];
  let quitCount = 0;
  Object.assign(app, {
    isPackaged: true,
    getPath: name => `/fixture/${name}`,
    setPath() {},
    requestSingleInstanceLock: () => true,
    whenReady: () => Promise.resolve(),
    quit: () => { quitCount += 1; },
    setLoginItemSettings: settings => startupChanges.push(settings),
    getLoginItemSettings: () => ({ openAtLogin: false })
  });
  class Window extends EventEmitter {
    constructor() {
      super();
      windows.push(this);
      this.visible = false;
      this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      this.webContents.executeJavaScript = async () => true;
    }
    isDestroyed() { return false; }
    isMinimized() { return false; }
    show() { this.visible = true; }
    hide() { this.visible = false; }
    focus() {}
    async loadURL() { this.emit('ready-to-show'); }
  }
  class Tray extends EventEmitter {
    constructor() { super(); trays.push(this); }
    setToolTip() {}
    setContextMenu(menu) { this.menu = menu; }
  }
  const electron = {
    app, BrowserWindow: Window, Tray,
    Menu: { buildFromTemplate: template => template },
    nativeImage: { createFromPath: () => ({ resize: () => ({}) }) },
    clipboard: { writeText() {} },
    dialog: { showMessageBox: async () => {}, showMessageBoxSync() {}, showErrorBox: (...details) => messages.push(details) },
    shell: { openExternal: async () => {} }, session: { defaultSession: new EventEmitter() }
  };
  const source = await readFile(new URL('../packaging/windows/main.cjs', import.meta.url), 'utf8');
  const context = vm.createContext({
    process: { argv: ['AutoLeadPC.exe', ...argumentsList], env: {}, resourcesPath: '/fixture/resources' },
    __dirname: '/fixture', URL, AbortSignal, console, setTimeout, clearTimeout,
    fetch: async () => ({ ok: true }),
    require: name => {
      if (name === 'electron') return electron;
      if (name === 'node:fs') return { mkdirSync() {}, existsSync: () => true, createWriteStream: () => ({ end() {} }) };
      if (name === 'node:net') return { createServer: () => ({ once() {}, listen(_port, _host, callback) { callback(); }, close(callback) { callback(); } }) };
      if (name === './import-bundled-settings.cjs') return { importBundledSettings() {} };
      if (name === './server-control.cjs') return require('../packaging/windows/server-control.cjs');
      if (name === 'node:child_process') return { spawn: (binary, args, options) => {
        const child = new EventEmitter();
        Object.assign(child, { pid: 12345, exitCode: null, signalCode: null, connected: true, stdout: { pipe() {} }, stderr: { pipe() {} }, send(message, callback) { child.shutdownMessage = message; child.exitCode = 0; child.emit('exit', 0); callback(); } });
        launches.push({ binary, args, options, child });
        return child;
      } };
      return require(name);
    }
  });
  vm.runInContext(source, context);
  for (let turn = 0; turn < 5; turn += 1) await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(messages, [], 'Wrapper phải khởi động được trong fixture');
  return { app, launches, windows, trays, startupChanges, quitCount: () => quitCount };
}

test('server mở LAN, chạy ẩn và đóng cửa sổ không dừng backend', async () => {
  const runtime = await runWindowsWrapper(['--server', '--install-startup']);
  assert.equal(runtime.launches.length, 1);
  assert.ok(runtime.launches[0].args.includes('--public'));
  assert.equal(runtime.launches[0].options.env.AUTOLEADPC_DISABLE_TUNNEL, '1');
  assert.equal(runtime.startupChanges.length, 1);
  assert.equal(runtime.startupChanges[0].openAtLogin, true);
  assert.deepEqual([...runtime.startupChanges[0].args], ['--server']);
  assert.equal(runtime.windows[0].visible, false);
  assert.equal(runtime.trays.length, 1);
  let prevented = false;
  runtime.windows[0].emit('close', { preventDefault() { prevented = true; } });
  runtime.app.emit('window-all-closed');
  assert.equal(prevented, true);
  assert.equal(runtime.quitCount(), 0);
  runtime.app.emit('second-instance', {}, ['AutoLeadPC.exe']);
  assert.equal(runtime.windows[0].visible, true);
  assert.equal(runtime.launches.length, 1);
  runtime.app.emit('before-quit', { preventDefault() {} });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(runtime.launches[0].child.shutdownMessage, 'autoleadpc:shutdown');
  assert.equal(runtime.quitCount(), 1);
});

test('chế độ cửa sổ giữ loopback và thoát khi đóng cửa sổ cuối', async () => {
  const runtime = await runWindowsWrapper();
  assert.equal(runtime.launches[0].args.includes('--public'), false);
  assert.equal(runtime.windows[0].visible, true);
  assert.equal(runtime.trays.length, 0);
  runtime.app.emit('window-all-closed');
  assert.equal(runtime.quitCount(), 1);
});

test('gỡ autorun không khởi động thêm backend', async () => {
  const runtime = await runWindowsWrapper(['--remove-startup']);
  assert.equal(runtime.launches.length, 0);
  assert.equal(runtime.startupChanges[0].openAtLogin, false);
  assert.equal(runtime.quitCount(), 1);
});

test('Startup dùng đúng executable có khoảng trắng và chỉ truyền cờ server', () => {
  const writes = [];
  const app = { getPath: () => 'C:\\Apps With Spaces\\AutoLeadPC.exe', setLoginItemSettings: settings => writes.push(settings) };
  setWindowsServerStartup(app, true);
  setWindowsServerStartup(app, false);
  assert.equal(writes[0].path, app.getPath());
  assert.deepEqual(writes[0].args, ['--server']);
  assert.equal(writes[1].openAtLogin, false);
  assert.deepEqual(windowsServerStartupOptions(app), { name: 'AutoLeadPC Server', path: app.getPath(), args: ['--server'] });
  assert.deepEqual(windowsServerAddresses(3211, { loopback: [{ internal: true, family: 'IPv4', address: '127.0.0.1' }], lan: [{ internal: false, family: 'IPv4', address: '192.168.1.15' }, { internal: false, family: 4, address: '192.168.1.15' }], link: [{ internal: false, family: 'IPv4', address: '169.254.1.2' }], ipv6: [{ internal: false, family: 'IPv6', address: '::1' }] }), ['http://192.168.1.15:3211']);
});

test('server LAN không khởi tạo public tunnel', async () => {
  const { stdout } = await executeFile(process.execPath, ['--input-type=module', '-e', "const { startTunnel } = await import('./src/tunnel/start-tunnel.mjs'); console.log(JSON.stringify(await startTunnel()));"], { cwd: new URL('..', import.meta.url), env: { ...process.env, AUTOLEADPC_DISABLE_TUNNEL: '1' } });
  const result = JSON.parse(stdout.trim());
  assert.equal(result.ok, false);
  assert.match(result.error, /server LAN/);
});

test('Firewall chỉ mở đúng Node, cổng và subnet trên mạng Private', async () => {
  const source = await readFile(new URL('../packaging/windows/server/Windows-LAN.ps1', import.meta.url), 'utf8');
  assert.match(source, /#requires -RunAsAdministrator/);
  assert.match(source, /-Program \$nodeExecutable -Profile Private -RemoteAddress LocalSubnet/);
  assert.match(source, /-LocalPort \$Port/);
  assert.doesNotMatch(source, /Set-NetFirewallProfile/);
  if (process.platform === 'win32') {
    await executeFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', "$tokens = $null; $errors = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:AUTOLEADPC_FIREWALL_SCRIPT, [ref]$tokens, [ref]$errors); if ($errors.Count) { $errors | ForEach-Object { Write-Error $_ }; exit 1 }"], { env: { ...process.env, AUTOLEADPC_FIREWALL_SCRIPT: fileURLToPath(new URL('../packaging/windows/server/Windows-LAN.ps1', import.meta.url)) } });
  }
});
