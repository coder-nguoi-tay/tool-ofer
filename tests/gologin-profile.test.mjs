import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';
import { homedir } from 'node:os';
const directory = mkdtempSync(join(homedir(), 'Library/Application Support/AutoLeadPC-tests-gologin-profile-'));
process.env.AUTOLEADPC_DATA_DIR = basename(directory);
const { buildGoLoginProfileRequest, createGoLoginProfile, updateGoLoginProfile, deleteGoLoginProfile,
  getOrCreateGoLoginProfile } = await import('../gologin-profile.mjs');
const { readGoLoginConfig } = await import('../src/runtime/actions/read-gologin-config.mjs');
const { saveGoLoginConfig } = await import('../src/runtime/actions/save-gologin-config.mjs');
const { reservedGoLoginProfileIds } = await import('../src/gologin-profile/profile-reservations.mjs');
test.after(() => rmSync(directory, { recursive: true, force: true }));
test.afterEach(() => reservedGoLoginProfileIds.clear());

test('buildGoLoginProfileRequest dựng đúng payload cho Windows, macOS và Android', () => {
  const reqWin = buildGoLoginProfileRequest({
    slot: 1,
    proxy: { server: 'socks5://user:pass@1.2.3.4:1080' },
    exitIp: '1.2.3.4',
    deviceProfile: 'windows',
    browserVersion: '150',
    resolution: '1920x1080'
  });

  assert.equal(reqWin.os, 'win');
  assert.ok(reqWin.name.includes('Slot 1'));
  assert.ok(reqWin.name.includes('Win'));
  assert.ok(reqWin.name.includes('Chrome 150'));
  assert.equal(reqWin.proxy.mode, 'socks5');
  assert.equal(reqWin.proxy.host, '1.2.3.4');
  assert.equal(reqWin.proxy.port, 1080);
  assert.equal(reqWin.proxy.username, 'user');
  assert.equal(reqWin.proxy.password, 'pass');
  assert.equal(reqWin.navigator.platform, 'Win32');
  assert.ok(reqWin.navigator.userAgent.includes('Chrome/150.0.0.0'));
  assert.equal(reqWin.webGLMetadata.vendor, 'Google Inc. (NVIDIA)');

  const reqMac = buildGoLoginProfileRequest({
    slot: 2,
    proxy: null,
    exitIp: 'Direct',
    deviceProfile: 'macos',
    browserVersion: '152',
    resolution: '1440x900'
  });

  assert.equal(reqMac.os, 'mac');
  assert.ok(reqMac.name.includes('Slot 2'));
  assert.ok(reqMac.name.includes('macOS'));
  assert.ok(reqMac.name.includes('Chrome 152'));
  assert.equal(reqMac.proxy.mode, 'none');
  assert.equal(reqMac.navigator.platform, 'MacIntel');
  assert.ok(reqMac.navigator.userAgent.includes('Chrome/152.0.0.0'));
  assert.equal(reqMac.webGLMetadata.vendor, 'Google Inc. (Apple)');

  const reqAndroid = buildGoLoginProfileRequest({
    slot: 3,
    proxy: null,
    exitIp: 'Direct',
    deviceProfile: 'android',
    browserVersion: '154',
    resolution: '412x915'
  });

  assert.equal(reqAndroid.os, 'android');
  assert.equal(reqAndroid.navigator.platform, 'Linux armv8l');
  assert.equal(reqAndroid.navigator.maxTouchPoints, 5);
  assert.ok(reqAndroid.navigator.userAgent.includes('Mobile'));
});

test('createGoLoginProfile gửi Bearer token và trả về profile ID', async () => {
  const mockFetch = async (url, options) => {
    assert.equal(url, 'https://api.gologin.com/browser/custom');
    assert.equal(options.method, 'POST');
    assert.ok(options.headers.Authorization.startsWith('Bearer test-token'));
    const body = JSON.parse(options.body);
    assert.equal(body.name, 'Test Profile');
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 'gl-profile-12345' })
    };
  };

  const profileId = await createGoLoginProfile('test-token', { name: 'Test Profile' }, mockFetch);
  assert.equal(profileId, 'gl-profile-12345');
});

test('getOrCreateGoLoginProfile ưu tiên tái sử dụng profile rảnh', async () => {
  let updatedProfileId = null;
  const mockFetch = async (url, options) => {
    if (url === 'https://api.gologin.com/browser/v2') {
      return {
        ok: true,
        json: async () => ({
          profiles: [
            { id: 'busy-1', name: 'Slot 1' },
            { id: 'idle-2', name: 'Slot 2 • AutoLeadPC', notes: 'AutoLeadPC Mac • fixture', status: 'stopped' }
          ]
        })
      };
    }
    if (url.includes('/browser/idle-2/custom')) {
      updatedProfileId = 'idle-2';
      return { ok: true, json: async () => ({}) };
    }
    throw new Error('Unexpected URL: ' + url);
  };

  const id = await getOrCreateGoLoginProfile('test-token', { name: 'New Slot 2' }, new Set(['busy-1']), 2, mockFetch);
  assert.equal(id, 'idle-2');
  assert.equal(updatedProfileId, 'idle-2');
});

test('token chưa cấu hình phải rỗng, chỉ dùng token người dùng lưu', async () => {
  assert.deepEqual(await readGoLoginConfig(), { token: '' });
  await saveGoLoginConfig({ token: 'fixture-user-token' });
  assert.deepEqual(await readGoLoginConfig(), { token: 'fixture-user-token' });
});

test('không lấy profile cá nhân hoặc profile chưa chứng minh đã dừng', async () => {
  let created = false;
  const id = await getOrCreateGoLoginProfile('mock', { name: 'new' }, new Set(), 1, async (url, options) => {
    if (url.endsWith('/v2')) return { ok: true, json: async () => ({ profiles: [
      { id: 'personal', name: 'Personal', status: 'stopped' },
      { id: 'unknown', notes: 'AutoLeadPC Mac • fixture' }
    ] }) };
    assert.equal(options.method, 'POST');
    created = true;
    return { ok: true, json: async () => ({ id: 'new-profile' }) };
  });
  assert.equal(created, true);
  assert.equal(id, 'new-profile');
});

test('cập nhật profile lỗi phải dừng, không chạy cấu hình proxy cũ', async () => {
  const active = new Set();
  await assert.rejects(getOrCreateGoLoginProfile('mock', {}, active, 1, async url =>
    url.endsWith('/v2') ? { ok: true, json: async () => ({ profiles: [
      { id: 'owned', notes: 'AutoLeadPC Mac • fixture', status: 'stopped' }
    ] }) } : { ok: false, status: 500, text: async () => 'fixture failure' }), /500/);
  assert.equal(active.has('owned'), false);
  assert.equal(reservedGoLoginProfileIds.has('owned'), false);
});

test('hai lượt đồng thời không chọn chung profile trong khi cập nhật còn chờ', async () => {
  let releaseUpdate;
  const gate = new Promise(resolve => { releaseUpdate = resolve; });
  const mockFetch = async (url, options) => {
    if (url.endsWith('/v2')) return { ok: true, json: async () => ({ profiles: [
      { id: 'owned', notes: 'AutoLeadPC Mac • fixture', status: 'stopped' }
    ] }) };
    if (options.method === 'PUT') { await gate; return { ok: true, json: async () => ({}) }; }
    return { ok: true, json: async () => ({ id: 'new-profile' }) };
  };
  const first = getOrCreateGoLoginProfile('mock', {}, new Set(), 1, mockFetch);
  await new Promise(resolve => setImmediate(resolve));
  const second = await getOrCreateGoLoginProfile('mock', {}, new Set(), 2, mockFetch);
  releaseUpdate();
  assert.equal(await first, 'owned');
  assert.equal(second, 'new-profile');
});

test('Windows 11, Mac Intel và Mac ARM được phân biệt bằng OS/osSpec chính thức', () => {
  const windows11 = buildGoLoginProfileRequest({ deviceProfile: 'windows11' });
  assert.equal(windows11.os, 'win'); assert.equal(windows11.osSpec, 'win11');
  assert.equal(windows11.navigator.platform, 'Win32');
  const intel = buildGoLoginProfileRequest({ deviceProfile: 'macos-intel' });
  assert.equal(intel.os, 'mac'); assert.equal(intel.osSpec, '');
  assert.equal(intel.webGLMetadata.vendor, 'Intel Inc.');
  assert.ok(intel.navigator.userAgent.includes('Macintosh'));
  const arm = buildGoLoginProfileRequest({ deviceProfile: 'macos-arm' });
  assert.equal(arm.os, 'mac'); assert.equal(arm.osSpec, 'M2');
  assert.ok(arm.webGLMetadata.renderer.includes('Apple M2'));
});

test('profile khác OS/osSpec không được tái sử dụng vì GoLogin khóa OS sau tạo', async () => {
  let updated = false;
  const id = await getOrCreateGoLoginProfile('mock', { os: 'win', osSpec: 'win11' }, new Set(), 1, async (url, options) => {
    if (url.endsWith('/v2')) return { ok: true, json: async () => ({ profiles: [
      { id: 'mac-profile', notes: 'AutoLeadPC Mac • test', status: 'stopped', os: 'mac', osSpec: 'M2' },
      { id: 'win10-profile', notes: 'AutoLeadPC Mac • test', isRunning: false, os: 'win', osSpec: '' }
    ] }) };
    if (options.method === 'PUT') updated = true;
    return { ok: true, json: async () => ({ id: 'new-windows11' }) };
  });
  assert.equal(id, 'new-windows11'); assert.equal(updated, false);
});

test('lưu các loại profile không làm mất token và đổi token không làm mất lựa chọn thiết bị', async () => {
  await saveGoLoginConfig({ token: 'fixture-token', devices: ['windows11', 'macos-arm'] });
  await saveGoLoginConfig({ devices: ['linux', 'android'] });
  assert.equal((await readGoLoginConfig()).token, 'fixture-token');
  await saveGoLoginConfig({ token: 'fixture-token-new' });
  assert.deepEqual((await readGoLoginConfig()).devices, ['linux', 'android']);
});

test('dừng profile: tắt hẳn Orbita rồi xóa dữ liệu tạm, không tải profile lên mây (profile bị xóa ngay sau đó)', async () => {
  const { stopGoLoginProfile } = await import('../src/gologin-profile/stop-gologin-profile.mjs');
  const calls = [];
  const child = { pid: 12345, exitCode: null, signalCode: null, kill(signal) { calls.push(signal); this.signalCode = signal; } };
  await stopGoLoginProfile({ processSpawned: child, stop: async () => calls.push('commit'), clearProfileFiles: async () => calls.push('clear') });
  assert.deepEqual(calls, ['SIGTERM', 'clear']);
});

test('SDK nhận chế độ headless từ lúc spawn khi chọn chạy trong app', async () => {
  const { buildGoLoginLaunchOptions } = await import('../src/gologin-profile/build-launch-options.mjs');
  const saving = ['--renderer-process-limit=2', '--disable-background-networking', '--disable-component-update', '--disable-domain-reliability',
    '--disable-features=AutofillServerCommunication,OptimizationHints,MediaRouter,Translate', '--webrtc-ip-handling-policy=disable_non_proxied_udp'];
  assert.deepEqual(buildGoLoginLaunchOptions({ screenPreviewOnly: true }).extra_params, ['--headless=new', ...saving]);
  assert.deepEqual(buildGoLoginLaunchOptions({ hideUntilLead: true }).extra_params, ['--window-position=-20000,-20000', '--start-minimized', ...saving]);
  assert.deepEqual(buildGoLoginLaunchOptions({}), { extra_params: saving });
  assert.equal(buildGoLoginProfileRequest({ deviceProfile: 'windows' }).startUrl, 'about:blank', 'không mở trang Google khởi động');
  assert.equal(saving.includes('--no-pings'), false, 'giữ <a ping> để tracking affiliate ghi nhận click');
  assert.equal(JSON.stringify(buildGoLoginLaunchOptions({ screenPreviewOnly: true })).includes('max-old-space-size'), false, 'không giới hạn heap JS vì trang đọc được');
});

test('mỗi profile máy tính/Android lấy fingerprint thật của GoLogin; Android/iPhone/iPad xoay model và OS; GoLogin lỗi thì dùng cấu hình tĩnh', async () => {
  const { pickGoLoginDeviceHardware } = await import('../src/gologin-profile/pick-device-hardware.mjs');
  const fingerprint = { navigator: { resolution: '1280x960', platform: 'Win32', hardwareConcurrency: 4, deviceMemory: 8, maxTouchPoints: 0,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.8078.47 Safari/537.36', language: 'en-US' },
    webGLMetadata: { mode: 'noise', vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    webglParams: { glCanvas: 'webgl2' }, fonts: ['Arial', 'Segoe UI'], mediaDevices: {}, devicePixelRatio: 1.25, os: 'win' };
  const urls = [];
  const request = async url => { urls.push(url); return { ok: true, json: async () => structuredClone(fingerprint) }; };
  const desktop = await pickGoLoginDeviceHardware('token', 'windows11', request);
  await pickGoLoginDeviceHardware('token', 'macos-arm', request);
  assert.deepEqual(urls, ['https://api.gologin.com/browser/fingerprint?os=win', 'https://api.gologin.com/browser/fingerprint?os=mac&isM1=true']);
  const profile = buildGoLoginProfileRequest({ deviceProfile: 'windows11', browserVersion: '151.0.7922.173', hardware: desktop });
  assert.equal(profile.navigator.userAgent, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.7922.173 Safari/537.36', 'giữ bản Orbita đã chọn');
  assert.deepEqual([profile.navigator.resolution, profile.navigator.hardwareConcurrency, profile.navigator.language], ['1280x960', 4, 'en-US,en;q=0.9']);
  assert.deepEqual(profile.webGLMetadata, { mode: 'mask', vendor: 'Google Inc. (Intel)', renderer: fingerprint.webGLMetadata.renderer });
  assert.deepEqual(profile.fonts, { families: ['Arial', 'Segoe UI'] });
  assert.equal(profile.osSpec, 'win11');
  assert.equal(await pickGoLoginDeviceHardware('token', 'linux', async () => ({ ok: false })), null);
  assert.equal(await pickGoLoginDeviceHardware('token', 'linux', async () => { throw new Error('offline'); }), null);
  const { iosVersions } = await import('../src/stealth/state/ios-versions.mjs');
  for (const deviceProfile of ['ios', 'ipad']) {
    const { deviceVariant: appleVariant } = await pickGoLoginDeviceHardware('token', deviceProfile, () => assert.fail('iOS không gọi GoLogin'));
    const apple = buildGoLoginProfileRequest({ deviceProfile, browserVersion: '152.0.7977.82', hardware: { deviceVariant: appleVariant } });
    assert.ok(iosVersions.some(version => apple.navigator.userAgent.includes(`OS ${version} like Mac OS X`)), apple.navigator.userAgent);
    assert.ok(apple.navigator.userAgent.includes('CriOS/152.0.7977.82'));
    assert.equal(apple.navigator.resolution, `${appleVariant.viewport.width}x${appleVariant.viewport.height}`);
    assert.equal(apple.screenWidth, appleVariant.viewport.width);
  }
});
