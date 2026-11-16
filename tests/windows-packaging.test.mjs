import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromeBuildExecutable } from '../src/chrome-versions/chrome-build-executable.mjs';
import { isManagedChromeProfilePath } from '../src/browser/chrome-profiles/is-managed-chrome-profile-path.mjs';
import { chromeProfileDirectory, chromeProfileCacheDirectory } from '../src/browser/chrome-paths.mjs';
import { executePlatformFile } from '../src/process/actions/execute-platform-file.mjs';

const executeFile = promisify(execFile);
const require = createRequire(import.meta.url);

/**
 * Kiểm tra đường dẫn Windows trong một tiến trình cô lập, không đụng dữ liệu runtime.
 * @return {Promise<void>} Các đường dẫn và dấu phân cách đúng Windows.
 * @throws {AssertionError} Khi vẫn dùng đường dẫn macOS hoặc PATH sai dấu phân cách.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function verifiesWindowsPaths() {
  const { stdout } = await executeFile(process.execPath, ['--input-type=module', '-e', `
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const paths = await import('./src/config/paths.mjs');
    const { chromeForTestingPlatform } = await import('./src/chrome-versions/chrome-for-testing-platform.mjs');
    const { windowsChromePaths } = await import('./src/browser/windows-chrome-paths.mjs');
    console.log(JSON.stringify({ data: paths.appDataDirectory, platform: chromeForTestingPlatform(), chrome: windowsChromePaths() }));
  `], { cwd: new URL('..', import.meta.url), env: { ...process.env, APPDATA: join(tmpdir(), 'Windows Roaming'), LOCALAPPDATA: join(tmpdir(), 'Windows Local'), AUTOLEADPC_DATA_DIR: 'AutoLeadPC-Windows-Test' } });
  const result = JSON.parse(stdout.trim());
  assert.equal(result.data, join(tmpdir(), 'Windows Roaming', 'AutoLeadPC-Windows-Test'));
  assert.equal(result.platform, 'win64');
  assert.ok(result.chrome.some(path => path === join(tmpdir(), 'Windows Local', 'Google', 'Chrome', 'Application', 'chrome.exe')));
}
test('Windows dùng AppData và Chrome win64', verifiesWindowsPaths);

/**
 * Đảm bảo guard profile không chấp nhận thư mục gốc, traversal hoặc kho tên gần giống.
 * @return {void} Các đường dẫn nguy hiểm bị từ chối.
 * @throws {AssertionError} Khi guard chấp nhận đường dẫn ngoài kho.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
function verifiesManagedProfileBoundaries() {
  for (const root of [chromeProfileDirectory, chromeProfileCacheDirectory]) {
    assert.equal(isManagedChromeProfilePath(join(root, 'stable', '150', 'session')), true);
    assert.equal(isManagedChromeProfilePath(root), false);
    assert.equal(isManagedChromeProfilePath(`${root}-personal/session`), false);
    assert.equal(isManagedChromeProfilePath(`${root}/../personal`), false);
  }
  assert.equal(chromeBuildExecutable('build', 'win64'), join('build', 'chrome-win64', 'chrome.exe'));
  assert.equal(chromeBuildExecutable('build', 'mac-arm64'), join('build', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'));
}
test('Chrome Windows giữ ranh giới profile và vị trí binary', verifiesManagedProfileBoundaries);

/**
 * Xác nhận bộ cài chỉ lấy backend từ staging riêng và giữ dữ liệu khi gỡ ứng dụng.
 * @return {Promise<void>} Cấu hình đóng gói khớp hợp đồng.
 * @throws {AssertionError} Khi thiếu runtime hoặc cấu hình xóa dữ liệu người dùng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function verifiesInstallerConfiguration() {
  const configuration = require('../packaging/windows/electron-builder.cjs');
  assert.equal(configuration.nsis.deleteAppDataOnUninstall, false);
  assert.deepEqual(configuration.win.target, [{ target: 'nsis', arch: ['x64'] }]);
  assert.deepEqual(configuration.extraResources.map(resource => resource.from), ['.windows-build/backend', '.windows-build/backend/node_modules']);
  assert.ok(configuration.files.includes('!**/node_modules/**/*'));
  const source = await readFile(new URL('../scripts/build-windows.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes('Config/Browser'));
  assert.ok(source.includes("'--os=win32'"));
  assert.ok(source.includes('SHASUMS256.txt'));
}
test('Bộ cài Windows tách runtime và giữ dữ liệu khi uninstall', verifiesInstallerConfiguration);

/**
 * Thử nén và giải nén thật bằng tiện ích của nền tảng với tên tệp Unicode và dấu nháy.
 * @return {Promise<void>} Nội dung xuất nhật ký được bảo toàn.
 * @throws {Error} Khi nén/giải nén hoặc nội dung không khớp.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function verifiesArchiveRoundTrip() {
  const directory = await mkdtemp(join(tmpdir(), 'autoleadpc-archive-'));
  try {
    const filename = "nhật ký ' test.json";
    await writeFile(join(directory, filename), '{"lead":true}');
    await mkdir(join(directory, 'html'));
    const archive = join(directory, 'logs.zip');
    await executePlatformFile('zip', ['-q', '-r', archive, filename, 'html'], { cwd: directory });
    const destination = join(directory, 'restored');
    await executePlatformFile('unzip', ['-q', '-o', archive, '-d', destination]);
    assert.equal(await readFile(join(destination, filename), 'utf8'), '{"lead":true}');
  } finally { await rm(directory, { recursive: true, force: true }); }
}
test('Xuất ZIP nhật ký và giải nén trên nền tảng hiện tại', verifiesArchiveRoundTrip);

/**
 * Kiểm tra cấu hình riêng tư được nạp một lần và không thay token đã có trên máy nhận.
 * @return {Promise<void>} Cấu hình mới được nạp và cấu hình người dùng được giữ.
 * @throws {AssertionError} Khi ghi đè hoặc nạp lại dữ liệu sau khi đã đánh dấu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function verifiesPrivateSettingsImport() {
  const { importBundledSettings } = require('../packaging/windows/import-bundled-settings.cjs');
  const directory = await mkdtemp(join(tmpdir(), 'autoleadpc-private-import-'));
  const seed = join(directory, 'seed');
  const instance = join(directory, 'instance');
  const common = join(directory, 'common');
  try {
    await mkdir(join(seed, 'instance'), { recursive: true });
    await mkdir(join(seed, 'common/Config/Settings'), { recursive: true });
    await mkdir(instance);
    await writeFile(join(seed, 'instance/gologin-config.json'), '{"token":"fixture-bundled-token"}');
    await writeFile(join(seed, 'instance/proxy-queue.json'), '[]');
    await writeFile(join(seed, 'common/Config/Settings/Settings.ini'), 'Windows=True');
    await writeFile(join(instance, 'gologin-config.json'), '{"token":"fixture-existing-token"}');
    assert.equal(importBundledSettings(seed, instance, common), 2);
    assert.equal(await readFile(join(instance, 'gologin-config.json'), 'utf8'), '{"token":"fixture-existing-token"}');
    assert.equal(await readFile(join(common, 'Config/Settings/Settings.ini'), 'utf8'), 'Windows=True');
    await rm(join(instance, 'proxy-queue.json'));
    assert.equal(importBundledSettings(seed, instance, common), 0);
    await assert.rejects(readFile(join(instance, 'proxy-queue.json')), { code: 'ENOENT' });
    assert.equal(importBundledSettings(join(directory, 'missing'), instance, common), 0);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
test('Gói riêng tư nạp cấu hình một lần và giữ token đang có', verifiesPrivateSettingsImport);
