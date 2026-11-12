import assert from 'node:assert/strict';
import test from 'node:test';
import { recordProxyOutcome, sessionLabel } from '../src/leads/actions/record-proxy-outcome.mjs';

/**
 * Lịch sử proxy giả trong RAM: không đụng file proxy-usage.json thật của app.
 * @param {object} proxies Bản ghi ban đầu.
 * @return {{read: Function, persist: Function, saved: object[]}} Hàm đọc/ghi giả và các lần ghi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function memoryHistory(proxies) {
  const saved = [];
  return { saved, read: async () => ({ proxies: structuredClone(proxies) }), persist: async history => { saved.push(history); } };
}

test('recordProxyOutcome: ghi status/reason/completedAt, giữ field cũ của bản ghi', async () => {
  const store = memoryHistory({ k1: { status: 'success', exitIp: '198.51.100.90', proxy: 'p1' } });
  const stop = await recordProxyOutcome({ proxyKey: 'k1', exitIp: '198.51.100.90' }, 'duplicate_ip', 'IP trùng', store);
  assert.equal(stop, false);
  assert.equal(store.saved.length, 1);
  const entry = store.saved[0].proxies.k1;
  assert.equal(entry.status, 'duplicate_ip');
  assert.equal(entry.reason, 'IP trùng');
  assert.equal(entry.proxy, 'p1');
  assert.match(entry.completedAt, /^\d{4}-\d\d-\d\dT/);
});

test('recordProxyOutcome: không có proxyKey hoặc chưa có bản ghi → không ghi', async () => {
  const store = memoryHistory({});
  assert.equal(await recordProxyOutcome({ exitIp: '198.51.100.91' }, 'failed', 'x', store), false);
  assert.equal(await recordProxyOutcome({ proxyKey: 'missing', exitIp: '198.51.100.91' }, 'failed', 'x', store), false);
  assert.equal(store.saved.length, 0);
});

test('recordProxyOutcome: IP vừa thành lead trong lúc đọc → báo dừng, không ghi đè', async () => {
  const session = { proxyKey: 'k2', exitIp: '198.51.100.92' };
  const store = memoryHistory({ k2: { status: 'success', exitIp: '198.51.100.92' } });
  const read = async () => { session.confirmedLeadIp = '198.51.100.92'; return store.read(); };
  assert.equal(await recordProxyOutcome(session, 'failed', 'x', { read, persist: store.persist }), true);
  assert.equal(store.saved.length, 0);
});

test('recordProxyOutcome: đọc lịch sử lỗi → bỏ qua, không chặn việc đóng', async () => {
  const read = async () => { throw new Error('disk'); };
  assert.equal(await recordProxyOutcome({ proxyKey: 'k3', exitIp: '198.51.100.93' }, 'failed', 'x', { read, persist: async () => assert.fail() }), false);
});

test('sessionLabel: Chrome → Profile → Slot', () => {
  assert.equal(sessionLabel({ chromeVersion: '140.0.1' }), 'Chrome 140.0.1');
  assert.equal(sessionLabel({ profileId: 'ab12' }), 'Profile ab12');
  assert.equal(sessionLabel({ slot: 7, tileIndex: 2 }), 'Slot 7');
  assert.equal(sessionLabel({ tileIndex: 2 }), 'Slot 3');
  assert.equal(sessionLabel({}), 'Slot 1');
});
