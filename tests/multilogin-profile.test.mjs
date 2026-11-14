import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  formatMultiloginProxy,
  buildMultiloginProfileRequest,
  requestMultiloginCloud,
  requestMultiloginLauncher,
  startMultiloginProfile,
  stopMultiloginProfile,
  createMultiloginProfile,
  updateMultiloginProfile,
  deleteMultiloginProfile,
  getOrCreateMultiloginProfile
} from '../multilogin-profile.mjs';
import { readMultiloginConfig } from '../src/runtime/actions/read-multilogin-config.mjs';
import { saveMultiloginConfig } from '../src/runtime/actions/save-multilogin-config.mjs';

test('formatMultiloginProxy chuẩn hóa chính xác proxy SOCKS5 và HTTP', () => {
  const p1 = formatMultiloginProxy({ server: 'socks5://user:pass@1.2.3.4:1080' });
  assert.equal(p1.mode, 'socks5');
  assert.equal(p1.host, '1.2.3.4');
  assert.equal(p1.port, 1080);
  assert.equal(p1.username, 'user');
  assert.equal(p1.password, 'pass');

  const p2 = formatMultiloginProxy({ server: 'http://5.6.7.8:8080' });
  assert.equal(p2.mode, 'http');
  assert.equal(p2.host, '5.6.7.8');
  assert.equal(p2.port, 8080);
  assert.equal(p2.username, '');
  assert.equal(p2.password, '');

  const p3 = formatMultiloginProxy(null);
  assert.equal(p3.mode, 'none');
});

test('buildMultiloginProfileRequest dựng payload nhân Mimic và fingerprint cho slot', () => {
  const req = buildMultiloginProfileRequest({
    slot: 2,
    proxy: { server: 'socks5://proxy.example:1080', username: 'u', password: 'p' },
    exitIp: '1.2.3.4',
    folderId: 'folder-123',
    deviceProfile: 'macos',
    antiFingerprint: { canvas: true, clientRects: true, webgl: true, webrtc: true }
  });

  assert.equal(req.browser_type, 'mimic');
  assert.equal(req.os, 'mac');
  assert.equal(req.folder_id, 'folder-123');
  assert.ok(req.name.includes('Slot 2'));
  assert.ok(req.name.includes('Mimic'));
  assert.equal(req.parameters.proxy.mode, 'socks5');
  assert.equal(req.parameters.proxy.host, 'proxy.example');
  assert.equal(req.parameters.fingerprint.canvas.mode, 'noise');
  assert.equal(req.parameters.fingerprint.webrtc.mode, 'real');
});

test('requestMultiloginCloud gửi Bearer token và parse data trả về', async () => {
  const mockRequest = async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer mlx-token-test');
    return {
      ok: true,
      json: async () => ({ status: 'OK', data: { id: 'prof-999' } })
    };
  };

  const data = await requestMultiloginCloud('mlx-token-test', '/api/v2/profile', {}, mockRequest);
  assert.equal(data.id, 'prof-999');
});

test('startMultiloginProfile gọi Launcher với automation_type=playwright và trả về HTTP port', async () => {
  const mockLauncher = async (url) => {
    assert.ok(url.includes('automation_type=playwright'));
    return {
      ok: true,
      json: async () => ({
        status: 'OK',
        data: { port: 49152 }
      })
    };
  };

  const endpoint = await startMultiloginProfile({
    token: 'test-token',
    folderId: 'folder-abc',
    profileId: 'profile-xyz'
  }, mockLauncher);

  assert.equal(endpoint, 'http://127.0.0.1:49152');
});

test('startMultiloginProfile hỗ trợ fallback định dạng Multilogin 6', async () => {
  const mockLauncher = async () => ({
    ok: true,
    json: async () => ({
      status: 'OK',
      value: 'ws://127.0.0.1:35000/devtools/browser/abc'
    })
  });

  const endpoint = await startMultiloginProfile({
    token: 'test-token',
    profileId: 'profile-legacy'
  }, mockLauncher);

  assert.equal(endpoint, 'ws://127.0.0.1:35000/devtools/browser/abc');
});

test('stopMultiloginProfile gọi đúng endpoint dừng profile', async () => {
  let calledUrl = '';
  const mockLauncher = async (url) => {
    calledUrl = url;
    return {
      ok: true,
      json: async () => ({ status: 'OK' })
    };
  };

  await stopMultiloginProfile({
    token: 'test-token',
    folderId: 'folder-abc',
    profileId: 'profile-xyz'
  }, mockLauncher);

  assert.ok(calledUrl.includes('/api/v1/profile/stop/p/folder-abc/profile-xyz'));
});

test('getOrCreateMultiloginProfile tái sử dụng profile nhàn rỗi trong folder theo slot', async () => {
  const calls = [];
  const mockRequest = async (url, options) => {
    calls.push({ url, method: options.method });
    if (options.method === 'GET') {
      return {
        ok: true,
        json: async () => ({
          status: 'OK',
          data: [
            { id: 'prof-slot-1', name: 'Slot 1 • Mimic • 1.1.1.1' },
            { id: 'prof-slot-2', name: 'Slot 2 • Mimic • 2.2.2.2' }
          ]
        })
      };
    }
    if (options.method === 'PATCH') {
      return {
        ok: true,
        json: async () => ({ status: 'OK', data: { id: 'prof-slot-2' } })
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const profileId = await getOrCreateMultiloginProfile({
    token: 'test-token',
    folderId: 'f-1',
    slot: 2,
    profileRequest: {
      name: 'Slot 2 • Mimic • 3.3.3.3',
      parameters: { proxy: { mode: 'none' } }
    },
    activeProfileIds: new Set(['prof-slot-1'])
  }, mockRequest);

  assert.equal(profileId, 'prof-slot-2');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].method, 'GET');
  assert.equal(calls[1].method, 'PATCH');
});

test('saveMultiloginConfig và readMultiloginConfig lưu/đọc cấu hình nhất quán', async () => {
  await saveMultiloginConfig({
    token: 'mlx-secret-token',
    folderId: 'my-folder-id',
    launcherUrl: 'https://launcher.mlx.yt:45001'
  });

  const loaded = await readMultiloginConfig();
  assert.equal(loaded.token, 'mlx-secret-token');
  assert.equal(loaded.folderId, 'my-folder-id');
  assert.equal(loaded.launcherUrl, 'https://launcher.mlx.yt:45001');
});

test('Multilogin gắn watcher chống tab trùng trước khi mở trang đích', () => {
  const source = readFileSync(new URL('../src/browser/actions/open-multilogin-browser.mjs', import.meta.url), 'utf8');
  assert.match(source, /limitOfferTabs\(context, session\);\s+attachUniqueOfferTabs\(context, session\);\s+const initialPage/);
});
