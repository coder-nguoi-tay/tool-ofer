import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, basename, resolve, dirname } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { Readable } from 'node:stream';
import vm from 'node:vm';

const directory = mkdtempSync(join(homedir(), 'Library/Application Support/AutoLeadPC-tests-gologin-settings-'));
process.env.AUTOLEADPC_DATA_DIR = basename(directory);
const { readGoLoginConfig } = await import('../src/runtime/actions/read-gologin-config.mjs');
writeFileSync(join(directory, 'fixture.mjs'), `
export const getAutoLeadPCDir = () => ${JSON.stringify(join(directory, 'settings-fixture'))};
export const homedir = () => ${JSON.stringify(directory)};
export const readAdsPowerApiKey = async () => '';
export const readMultiloginConfig = async () => ({});
`);
test.after(() => rmSync(directory, { recursive: true, force: true }));

/**
 * Nạp route thật, chỉ thay đường dẫn legacy và nguồn cấu hình khác bằng fixture cô lập.
 * @param {string} filename Tên route cài đặt.
 * @return {Promise<object>} Module handler không đọc/ghi cài đặt của người dùng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function loadSettingsRoute(filename) {
  const sourcePath = resolve('src/http/routes/pc', filename);
  const code = readFileSync(sourcePath, 'utf8').replace(/from '([^']+)'/g, (match, location) => {
    if (location.endsWith('/config/paths.mjs') || location === 'node:os' ||
      location.endsWith('/read-ads-power-api-key.mjs') || location.endsWith('/read-multilogin-config.mjs')) return "from './fixture.mjs'";
    return location.startsWith('.') ? `from '${pathToFileURL(resolve(dirname(sourcePath), location)).href}'` : match;
  });
  const destination = join(directory, filename);
  writeFileSync(destination, code);
  return import(pathToFileURL(destination).href);
}

/**
 * Chạy handler trên request trong bộ nhớ, không mở cổng hoặc gửi token ra mạng.
 * @param {Function} handler Handler HTTP được kiểm tra.
 * @param {string} method GET hoặc POST.
 * @param {object} body Payload cài đặt giả.
 * @return {Promise<object>} Status và JSON trả về.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function requestSettings(handler, method, body = {}) {
  const request = Readable.from([JSON.stringify(body)]);
  request.method = method;
  request.url = method === 'POST' ? '/pc/settings/save' : '/pc/settings/read';
  const response = { writeHead(status) { this.status = status; }, end(content) { this.body = JSON.parse(content); } };
  assert.equal(await handler(request, response), true);
  return response;
}

test('Lưu cài đặt ghi token riêng; GET chỉ trả trạng thái; để trống và lưu phần khác không xóa token', async () => {
  const { handleGetPcSettingsRead } = await loadSettingsRoute('get-settings-read.mjs');
  const { handlePostPcSettingsSave } = await loadSettingsRoute('post-settings-save.mjs');
  assert.equal((await requestSettings(handleGetPcSettingsRead, 'GET')).body.gologinConfigured, false);
  const saved = await requestSettings(handlePostPcSettingsSave, 'POST', { gologinToken: ' fixture-settings-token ' });
  assert.equal(saved.status, 200);
  assert.equal((await readGoLoginConfig()).token, 'fixture-settings-token');
  const loaded = await requestSettings(handleGetPcSettingsRead, 'GET');
  assert.equal(loaded.body.gologinConfigured, true);
  assert.equal(JSON.stringify(loaded.body).includes('fixture-settings-token'), false);
  await requestSettings(handlePostPcSettingsSave, 'POST', { gologinToken: '   ', Canvas: true });
  await requestSettings(handlePostPcSettingsSave, 'POST', { Canvas: false });
  assert.equal((await readGoLoginConfig()).token, 'fixture-settings-token');
  const legacy = readFileSync(join(directory, 'settings-fixture/Config/Settings/Settings.ini'), 'utf8');
  assert.equal(legacy.includes('fixture-settings-token'), false);
});

test('giao diện lưu token ở Settings, xóa ô sau thành công và không gửi token khi Start', async () => {
  const elements = {
    gologinApiToken: { value: ' fixture-ui-token ' }, gologinTokenStatus: {}, settingsSaveStatus: {}
  };
  const payloads = [];
  const context = vm.createContext({
    document: { getElementById: id => elements[id] || null },
    api: async (path, options) => { if (options) payloads.push(JSON.parse(options.body)); return path === '/pc/settings/read' ? { gologinConfigured: true } : {}; },
    setTimeout: () => {}, syncBrowserChoice: () => {},
    syncGoLoginSetting: () => {}, localStorage: { getItem: () => null }
  });
  vm.runInContext(readFileSync('ui/desktop/functions/save-windows-settings.js', 'utf8'), context);
  vm.runInContext(readFileSync('ui/desktop/functions/load-windows-settings.js', 'utf8'), context);
  await context.saveWindowsSettings();
  assert.equal(payloads[0].gologinToken, 'fixture-ui-token');
  assert.equal(elements.gologinApiToken.value, '');
  await context.saveWindowsSettings();
  assert.equal(payloads[1].gologinToken, undefined);
  await context.loadWindowsSettings();
  assert.equal(elements.gologinApiToken.value, '');
  assert.match(elements.gologinTokenStatus.textContent, /Đã cấu hình/);
  const html = readFileSync('ui/desktop/index.html', 'utf8');
  assert.equal(html.match(/id="gologinApiToken"/g).length, 1);
  assert.ok(html.indexOf('id="gologinApiToken"') > html.indexOf('id="settingpanel-system"'));
  assert.equal(readFileSync('ui/desktop/functions/handle-start.js', 'utf8').includes('gologinToken:'), false);
});

test('lưu thất bại giữ token đang nhập để người dùng thử lại', async () => {
  const input = { value: 'fixture-retry-token' };
  const context = vm.createContext({ document: { getElementById: id => id === 'gologinApiToken' ? input : null },
    api: async () => ({ error: 'fixture save failed' }), setTimeout: () => {} });
  vm.runInContext(readFileSync('ui/desktop/functions/save-windows-settings.js', 'utf8'), context);
  await assert.rejects(context.saveWindowsSettings(), /save failed/);
  assert.equal(input.value, 'fixture-retry-token');
});

test('UI và API lưu/khôi phục lựa chọn GoLogin riêng, không làm đổi thiết bị Chrome', async () => {
  const { handleGetPcSettingsRead } = await loadSettingsRoute('get-settings-read.mjs');
  const { handlePostPcSettingsSave } = await loadSettingsRoute('post-settings-save.mjs');
  await requestSettings(handlePostPcSettingsSave, 'POST', { gologinDevices: ['windows11', 'macos-arm'] });
  assert.deepEqual((await requestSettings(handleGetPcSettingsRead, 'GET')).body.gologinDevices, ['windows11', 'macos-arm']);
  const inputs = ['windows', 'windows11', 'macos-intel', 'macos-arm', 'linux', 'android'].map(key => ({ dataset: { gologinDevice: key }, checked: false }));
  const context = vm.createContext({ document: { querySelectorAll: selector => selector.endsWith(':checked') ? inputs.filter(input => input.checked) : inputs } });
  vm.runInContext(readFileSync('ui/desktop/functions/gologin-device-settings.js', 'utf8'), context);
  context.applyGoLoginDeviceChoices(['windows11', 'macos-arm']);
  assert.deepEqual(Array.from(context.getGoLoginDeviceChoices()), ['windows11', 'macos-arm']);
  context.applyGoLoginDeviceChoices();
  assert.deepEqual(Array.from(context.getGoLoginDeviceChoices()), ['windows', 'windows11', 'macos-intel', 'macos-arm', 'linux', 'android']);
});

test('không có cấu hình GoLogin thì mặc định đa dạng đủ sáu thiết bị chính thức', async () => {
  const { selectGoLoginDevices } = await import('../src/gologin-profile/select-devices.mjs');
  assert.deepEqual(selectGoLoginDevices({}, {}), ['windows', 'windows11', 'macos-intel', 'macos-arm', 'linux', 'android']);
});
