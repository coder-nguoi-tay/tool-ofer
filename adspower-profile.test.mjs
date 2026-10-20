import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildAdsPowerProfileRequest, createAdsPowerProfile, startAdsPowerProfile, stopAdsPowerProfile, deleteAdsPowerProfile, cleanupOrphanedAdsPowerProfiles, findInstalledAdsPowerKernelVersion, listInstalledAdsPowerKernelVersions, selectAdsPowerKernelVersions } from './adspower-profile.mjs';

test('AdsPower chỉ chọn kernel đã tải xong thay vì bản đang tải', async (context) => {
  const installationDirectory = await mkdtemp(join(tmpdir(), 'adspower-kernels-'));
  context.after(() => rm(installationDirectory, { recursive: true, force: true }));
  await mkdir(join(installationDirectory, 'chrome_154'));
  const browserDirectory = join(installationDirectory, 'chrome_153', 'SunBrowser.app', 'Contents', 'MacOS');
  await mkdir(browserDirectory, { recursive: true });
  const browserBinary = join(browserDirectory, 'SunBrowser');
  await writeFile(browserBinary, '');
  await chmod(browserBinary, 0o755);
  assert.equal(await findInstalledAdsPowerKernelVersion(installationDirectory), '153');
  assert.deepEqual(await listInstalledAdsPowerKernelVersions(installationDirectory), ['153']);
  await assert.rejects(findInstalledAdsPowerKernelVersion(join(installationDirectory, 'missing')), /chưa có SunBrowser đã tải xong/);
});

test('AdsPower dùng kernel khác nhau cho các slot chạy đồng thời', () => {
  const installedVersions = ['155', '154', '153'];
  assert.deepEqual(selectAdsPowerKernelVersions(installedVersions, new Set(['155']), 0, 2), ['154', '153']);
  assert.deepEqual(selectAdsPowerKernelVersions(installedVersions, new Set(['155']), 1, 2), ['153', '154']);
  assert.deepEqual(selectAdsPowerKernelVersions(installedVersions, new Set(['155', '154']), 0, 2), ['153']);
});

test('AdsPower xoay vòng như Chrome thường khi có bản mới rảnh', () => {
  const installedVersions = ['155', '154', '153'];
  assert.deepEqual(selectAdsPowerKernelVersions(installedVersions, new Set(), 0, 2), ['155', '154']);
  assert.deepEqual(selectAdsPowerKernelVersions(installedVersions, new Set(), 1, 2), ['154', '153']);
  assert.deepEqual(selectAdsPowerKernelVersions(installedVersions, new Set(), 2, 2), ['153', '155']);
});

test('AdsPower profile giữ proxy của slot và fingerprint do SunBrowser quản lý', () => {
  const profile = buildAdsPowerProfileRequest({
    slot: 2,
    proxy: { server: 'socks5://proxy.example:1080', username: 'user', password: 'secret' },
    websiteUrl: 'https://example.com',
    browserVersion: '155',
    deviceProfile: 'macos',
    antiFingerprint: { canvas: true, clientRects: true, webgl: true, webrtc: true, apiFakeIP: true },
  });
  assert.equal(profile.group_id, '0');
  assert.equal(profile.user_proxy_config.proxy_host, 'proxy.example');
  assert.equal(profile.user_proxy_config.proxy_port, '1080');
  assert.equal(profile.user_proxy_config.proxy_password, 'secret');
  assert.equal(profile.fingerprint_config.browser_kernel_config.type, 'chrome');
  assert.equal(profile.fingerprint_config.browser_kernel_config.version, '155');
  assert.deepEqual(profile.fingerprint_config.random_ua.ua_version, ['155']);
  assert.equal(profile.fingerprint_config.webrtc, 'proxy');
  assert.equal(profile.fingerprint_config.canvas, '0');
  assert.equal(profile.fingerprint_config.client_rects, '0');
  assert.equal(profile.fingerprint_config.webgl_image, '0');
  assert.deepEqual(profile.tabs, ['https://example.com']);
  assert.ok(profile.name.includes('Chrome 155'));
  assert.ok(profile.remark.includes('Chrome 155'));
});

test('AdsPower dùng fingerprint mặc định và không thay WebRTC bằng proxy khi chạy Direct', () => {
  const profile = buildAdsPowerProfileRequest({
    slot: 1,
    browserVersion: '154',
    antiFingerprint: { canvas: false, clientRects: false, webgl: false, webrtc: true },
  });
  assert.equal(profile.fingerprint_config.webrtc, 'disabled');
  assert.equal(profile.fingerprint_config.canvas, '1');
  assert.equal(profile.fingerprint_config.client_rects, '1');
  assert.equal(profile.fingerprint_config.webgl_image, '1');
});

test('AdsPower tạo, mở, dừng và xóa đúng profile tạm của một slot', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    const data = url.endsWith('/create') ? { profile_id: 'profile-2' }
      : url.endsWith('/start') ? { ws: { puppeteer: 'ws://127.0.0.1:1234/devtools/browser/test' } }
      : {};
    return { ok: true, json: async () => ({ code: 0, data }) };
  };
  const profileId = await createAdsPowerProfile('test-key', buildAdsPowerProfileRequest({ slot: 2, browserVersion: '155' }), request);
  const wsUrl = await startAdsPowerProfile('test-key', profileId, request);
  await stopAdsPowerProfile('test-key', profileId, request);
  await deleteAdsPowerProfile('test-key', profileId, request);
  assert.equal(wsUrl, 'ws://127.0.0.1:1234/devtools/browser/test');
  assert.deepEqual(calls.map(({ url }) => url.split('/').at(-1)), ['create', 'start', 'stop', 'delete']);
  assert.deepEqual(JSON.parse(calls[3].options.body), { profile_id: ['profile-2'] });
  assert.ok(calls.every(({ options }) => options.headers.Authorization === 'Bearer test-key'));
});

test('AdsPower báo rõ khi Local API từ chối quyền tạo profile', async () => {
  const denied = async () => ({ ok: true, json: async () => ({ code: -1, msg: 'Require api-key' }) });
  await assert.rejects(createAdsPowerProfile('test-key', buildAdsPowerProfileRequest({ slot: 1, browserVersion: '155' }), denied), /Require api-key/);
});

test('cleanupOrphanedAdsPowerProfiles tự động xóa các profile AutoLeadPC mồ côi', async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    if (url.includes('/api/v1/user/list')) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            list: [
              { user_id: 'active-1', name: 'AutoLeadPC Mac 2 - Slot 1' },
              { user_id: 'orphan-1', name: 'AutoLeadPC Mac 2 - Slot 2' },
              { user_id: 'user-profile', name: 'My Main Profile' },
              { user_id: 'orphan-2', name: 'AutoLeadPC Mac 2 - Slot 3' },
            ],
          },
        }),
      };
    }
    if (url.includes('/api/v2/browser-profile/delete')) {
      return { ok: true, json: async () => ({ code: 0, data: {} }) };
    }
    return { ok: true, json: async () => ({ code: 0, data: {} }) };
  };

  const cleaned = await cleanupOrphanedAdsPowerProfiles('test-key', new Set(['active-1']), request);
  assert.equal(cleaned, 2);
  assert.equal(calls.length, 2);
  const deleteBody = JSON.parse(calls[1].options.body);
  assert.deepEqual(deleteBody.profile_id, ['orphan-1', 'orphan-2']);
});

test('createAdsPowerProfile tự động dọn dẹp và thử lại khi chạm giới hạn 12 profile', async () => {
  let attempt = 0;
  const request = async (url, options) => {
    if (url.includes('/api/v2/browser-profile/create')) {
      attempt++;
      if (attempt === 1) {
        return {
          ok: false,
          json: async () => ({ code: -1, msg: 'If the number of imported accounts exceeds the limit of 12, please delete some accounts' }),
        };
      }
      return {
        ok: true,
        json: async () => ({ code: 0, data: { profile_id: 'new-profile-id' } }),
      };
    }
    if (url.includes('/api/v1/user/list')) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            list: [{ user_id: 'old-temp', name: 'AutoLeadPC Mac 2 - Slot 1' }],
          },
        }),
      };
    }
    if (url.includes('/api/v2/browser-profile/delete')) {
      return { ok: true, json: async () => ({ code: 0, data: {} }) };
    }
    return { ok: true, json: async () => ({ code: 0, data: {} }) };
  };

  const profileId = await createAdsPowerProfile('test-key', buildAdsPowerProfileRequest({ slot: 1, browserVersion: '155' }), request);
  assert.equal(profileId, 'new-profile-id');
  assert.equal(attempt, 2);
});

test('buildAdsPowerProfileRequest đặt tên profile và trường ip là IP đã xác minh', () => {
  const profile = buildAdsPowerProfileRequest({
    slot: 1,
    exitIp: '68.230.225.44',
    proxy: { server: 'http://165.154.135.29:11422' },
    browserVersion: '155',
  });
  assert.ok(profile.name.includes('68.230.225.44'));
  assert.ok(profile.name.includes('Chrome 155'));
  assert.equal(profile.ip, '68.230.225.44');
  assert.ok(profile.remark.includes('Chrome 155'));
});

test('stopAdsPowerProfile coi lỗi Profile is not open là đã dừng thành công', async () => {
  const request = async () => ({
    ok: false,
    json: async () => ({ code: -1, msg: 'Profile is not open' }),
  });
  await assert.doesNotReject(stopAdsPowerProfile('test-key', 'profile-closed', request));
});
