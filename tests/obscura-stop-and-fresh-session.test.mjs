import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { runInNewContext } from 'node:vm';
import http from 'node:http';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';
import { applicationState } from '../src/runtime/application-state.mjs';
import { activeExitIpLocks } from '../src/runtime/constants/active-exit-ip-locks.mjs';
import { activeProxyLocks } from '../src/runtime/constants/active-proxy-locks.mjs';
import { pendingObscuraSessions, lastClosedObscuraIdentities } from '../src/obscura-engine/sessions.mjs';
import { createFreshObscuraProfile } from '../src/obscura-engine/create-fresh-profile.mjs';
import { getObscuraProfileIdentity } from '../src/obscura-engine/profile-identity.mjs';
import { openObscuraBrowser } from '../src/obscura-engine/open-obscura-browser.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';
import { getNextDeviceProfile } from '../src/browser/actions/get-next-device-profile.mjs';
import { closeChromeWhenLastTabCloses } from '../src/browser/actions/close-chrome-when-last-tab-closes.mjs';

let hasNativeBinary = true;
try { resolveObscuraBinary(); } catch { hasNativeBinary = false; }

test.afterEach(() => {
  activeBrowsers.clear(); pendingObscuraSessions.clear(); lastClosedObscuraIdentities.clear();
  activeExitIpLocks.clear(); activeProxyLocks.clear();
  autoRefill.enabled = false; autoRefill.stopRequested = false; autoRefill.noSlotRefill = false;
});

/**
 * Nạp source thật với mock tại biên hệ điều hành/mạng; không chạy pkill hoặc đọc cấu hình thật.
 * @param {string} file Module cần kiểm chứng từ gốc dự án.
 * @param {object} mocks Export được thay bằng fixture.
 * @param {object} context Test context dùng dọn mock.
 * @return {Promise<object>} Export của module kiểm chứng.
 * @throws {Error} Khi source hoặc import không hợp lệ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
async function loadFixture(file, mocks, context) {
  const sourceUrl = new URL(`../${file}`, import.meta.url);
  const key = `obscura-stop-${randomUUID()}`;
  globalThis[key] = mocks;
  context.after(() => { delete globalThis[key]; });
  const source = (await readFile(sourceUrl, 'utf8')).replace(/import \{([^}]+)\} from (["'])([^"']+)\2;/g, (statement, names, quote, location) => {
    const bindings = names.split(',').map(name => name.trim().split(/\s+as\s+/));
    if (bindings.every(([exportName]) => exportName in mocks)) return `const {${bindings.map(([exportName, localName]) => `${exportName}: ${localName || exportName}`).join(',')}} = globalThis[${JSON.stringify(key)}];`;
    return `import {${names}} from ${JSON.stringify(location.startsWith('.') ? new URL(location, sourceUrl).href : location)};`;
  });
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

/**
 * Bắt HTTP status/body của route không bind server hoặc truy cập dữ liệu thật.
 * @return {object} Response stub và kết quả có thể đọc sau khi route chạy.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
function createReply() {
  const result = {};
  return { result, response: { writeHead(status) { result.status = status; }, end(body) { result.body = JSON.parse(body); } } };
}

test('xoay nhóm thiết bị bỏ nhóm cũ khi có lựa chọn khác, giữ nhóm duy nhất được chọn', () => {
  const previous = autoRefill.deviceProfiles;
  const counter = applicationState.deviceProfileRotationCounter;
  try {
    autoRefill.deviceProfiles = ['windows', 'ipad']; applicationState.deviceProfileRotationCounter = 0;
    assert.equal(getNextDeviceProfile('windows'), 'ipad');
    assert.equal(getNextDeviceProfile('ipad'), 'windows');
    autoRefill.deviceProfiles = ['ipad'];
    assert.equal(getNextDeviceProfile('ipad'), 'ipad');
  } finally { autoRefill.deviceProfiles = previous; applicationState.deviceProfileRotationCounter = counter; }
});

for (const os of ['windows', 'iphone', 'ipad']) test(`profile bù ${os} đổi seed, fingerprint thiết bị và phiên bản trình duyệt`, { skip: !hasNativeBinary }, () => {
  const previous = createFreshObscuraProfile({ seed: 42, os });
  const previousIdentity = { ...getObscuraProfileIdentity(previous.profile), seed: String(previous.seed) };
  const replacement = createFreshObscuraProfile({ seed: 42, os, previousIdentity });
  assert.notEqual(replacement.seed, previous.seed);
  assert.notEqual(getObscuraProfileIdentity(replacement.profile).browserVersion, previousIdentity.browserVersion);
  assert.notEqual(getObscuraProfileIdentity(replacement.profile).deviceFingerprint, previousIdentity.deviceFingerprint);
});

test('PID bù và storage/cookie sạch, không nối lại process/context cũ', { skip: !hasNativeBinary, timeout: 15000 }, async t => {
  const server = http.createServer((request, response) => response.end('<html><body>Storage fixture</body></html>'));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const sessions = [];
  t.after(async () => { for (const session of sessions) await session.close(); await new Promise(resolve => server.close(resolve)); });
  const oldSession = await openObscuraBrowser({ slot: 993, port: 0, seed: 42, targetUrl: url });
  sessions.push(oldSession);
  await oldSession.page.evaluate(() => { localStorage.setItem('old-session', 'fixture'); document.cookie = 'old_session=fixture; path=/'; });
  assert.equal(await oldSession.page.evaluate(() => localStorage.getItem('old-session')), 'fixture');
  assert.match(await oldSession.page.evaluate(() => document.cookie), /old_session=fixture/);
  const previousIdentity = { ...getObscuraProfileIdentity(oldSession.profile), seed: oldSession.profile.id };
  await oldSession.close();
  assert.equal(oldSession.isObscuraProcessAlive(), false);
  const replacement = await openObscuraBrowser({ slot: 993, port: 0, previousIdentity, targetUrl: url });
  sessions.push(replacement);
  assert.notEqual(replacement.pid, oldSession.pid);
  assert.equal(await replacement.page.evaluate(() => localStorage.getItem('old-session')), null);
  assert.doesNotMatch(await replacement.page.evaluate(() => document.cookie), /old_session=fixture/);
});

test('IP bằng phiên vừa đóng bị loại trước khi spawn Obscura, kể cả tắt checkDuplicate', async t => {
  let started = false;
  lastClosedObscuraIdentities.set(994, { exitIps: ['192.0.2.1'] });
  const { openObscuraSession } = await loadFixture('src/obscura-engine/open-obscura-session.mjs', {
    fetchProxyGeo: async () => ({ ip: '192.0.2.1', timezone: 'UTC' }), waitForStableProxyIp: async (proxy, lookup) => lookup(),
    openObscuraBrowser: async () => { started = true; throw new Error('Không được spawn'); },
  }, t);
  await assert.rejects(openObscuraSession({ proxy: { server: 'http://127.0.0.1:19999' }, tileIndex: 993, checkDuplicate: false, shouldAbort: () => false }), /IP trùng phiên vừa đóng/);
  assert.equal(started, false);
});

for (const mode of ['refill', 'check_lead', 'no_slot_refill', 'stop_failed']) test(`tab cuối Screen View: ${mode}`, async t => {
  let pageClosed = false, processAlive = true, stopCalls = 0, refillCalls = 0;
  const page = new EventEmitter(); page.isClosed = () => pageClosed; page.url = () => 'https://fixture.invalid/';
  page.close = async () => { pageClosed = true; page.emit('close'); };
  const context = new EventEmitter(); context.pages = () => [page];
  const session = { slot: 995, engine: 'obscura', isObscura: true, trueHeadless: true,
    enableLeadCheck: mode === 'check_lead', browser: context, isObscuraProcessAlive: () => processAlive,
    close: async () => { stopCalls++; if (mode === 'stop_failed') throw new Error('native stop failed'); processAlive = false; session.isClosed = true; activeBrowsers.delete(session); } };
  activeBrowsers.add(session);
  Object.assign(autoRefill, { enabled: true, stopRequested: false, noSlotRefill: mode === 'no_slot_refill', targetCount: 2, settings: null });
  closeChromeWhenLastTabCloses(session);
  const { handlePostScreenTabsClose } = await loadFixture('src/http/routes/screen/post-tabs-close.mjs', { queueAutomaticRefill: () => { refillCalls++; } }, t);
  const request = Readable.from(['{"index":0}']); request.method = 'POST'; request.url = '/screen/tabs/close/995';
  const reply = createReply(); await handlePostScreenTabsClose(request, reply.response);
  assert.equal(reply.result.status, mode === 'stop_failed' ? 500 : 200);
  assert.equal(activeBrowsers.has(session), mode === 'stop_failed');
  assert.equal(processAlive, mode === 'stop_failed');
  assert.equal(stopCalls, 1, 'Watcher tab cuối không đóng/bù lần thứ hai');
  assert.equal(autoRefill.targetCount, mode === 'check_lead' ? 1 : 2);
  assert.equal(refillCalls, mode === 'refill' ? 1 : 0);
});

for (const preserveLeadSessions of [false, true]) test(`Đóng tất cả giữ khóa và đếm đúng phiên không dừng được; preserveLead=${preserveLeadSessions}`, async t => {
  const failed = { slot: 996, isObscura: true, isObscuraProcessAlive: () => true, close: async () => { throw new Error('native stop failed'); } };
  activeBrowsers.add(failed); activeExitIpLocks.add('192.0.2.1'); activeProxyLocks.add('fixture');
  if (preserveLeadSessions) activeBrowsers.add({ slot: 997, isObscura: true, exitIp: '192.0.2.99', confirmedLeadIp: '192.0.2.99', isObscuraProcessAlive: () => true });
  const { closeActiveBrowsers } = await loadFixture('src/browser/actions/close-active-browsers.mjs', {
    executeFile: async () => {}, readAdsPowerApiKey: async () => '', writeFile: async () => {}, stopAllContinuousAgents: () => {},
  }, t);
  const result = await closeActiveBrowsers({ preserveLeadSessions });
  assert.equal(result.closedCount, 0); assert.ok(result.warnings.some(warning => warning.includes('Obscura')));
  assert.equal(result.leadSessionsKeptCount, preserveLeadSessions ? 1 : 0);
  assert.equal(activeBrowsers.has(failed), true); assert.equal(failed.isClosed, false);
  assert.equal(activeExitIpLocks.has('192.0.2.1'), true); assert.equal(activeProxyLocks.has('fixture'), true);
});

test('Đóng tất cả nhận cả pending child xuất hiện trong lúc lượt dừng đầu đang chạy', async t => {
  let alive = true;
  const child = { slot: 998, isObscura: true, isObscuraProcessAlive: () => alive, close: async () => { alive = false; pendingObscuraSessions.delete(child); } };
  const { closeActiveBrowsers } = await loadFixture('src/browser/actions/close-active-browsers.mjs', {
    executeFile: async () => { pendingObscuraSessions.add(child); }, readAdsPowerApiKey: async () => '', writeFile: async () => {}, stopAllContinuousAgents: () => {},
  }, t);
  const result = await closeActiveBrowsers();
  assert.equal(alive, false); assert.equal(result.closedCount, 1); assert.equal(pendingObscuraSessions.size, 0);
});

for (const action of ['handleStop', 'handleCloseAll']) test(`Desktop ${action}: hiển thị lỗi/cảnh báo, không báo dừng thành công giả`, async () => {
  for (const result of [{ warnings: ['Obscura chưa dừng'] }, { error: 'native stop failed' }]) {
    const elements = new Map(), alerts = [];
    const context = { document: { getElementById: id => { if (!elements.has(id)) elements.set(id, {}); return elements.get(id); } },
      api: async () => result, fetchRunningState: async () => {}, showWinAlert: message => alerts.push(message) };
    for (const file of ['handle-stop', 'handle-close-all']) runInNewContext(await readFile(new URL(`../ui/desktop/functions/${file}.js`, import.meta.url), 'utf8'), context);
    await context[action](); assert.match(elements.get('lbStatus').textContent, /Chưa dừng hoàn tất/); assert.equal(alerts.length, 1);
  }
});

test('Mini Stop kiểm tra HTTP lỗi và cảnh báo backend trước khi hiển thị kết quả', async () => {
  for (const response of [{ ok: false, status: 500, body: { error: 'native stop failed' } }, { ok: true, status: 200, body: { warnings: ['Obscura chưa dừng'] } }]) {
    let onClick; const toasts = [];
    const context = { document: { getElementById: id => id === 'btnStopAll' ? { addEventListener: (event, handler) => { onClick = handler; } } : {} },
      fetch: async () => ({ ...response, json: async () => response.body }), showToast: message => toasts.push(message), pollState: async () => {} };
    runInNewContext(await readFile(new URL('../ui/mini/setup/btn-stop-all-click.js', import.meta.url), 'utf8'), context);
    await onClick(); assert.match(toasts.at(-1), /Lỗi|⚠️/); assert.doesNotMatch(toasts.at(-1), /✓/);
  }
});

for (const stopFails of [false, true]) test(`trang duplicate của Obscura dừng qua lifecycle, không ngắt CDP để reconnect; fail=${stopFails}`, async t => {
  let stopCalls = 0, contextCloseCalls = 0;
  const page = new EventEmitter(); page.isClosed = () => false;
  page.url = () => 'https://toffers.top/error.php?error=ip_192.0.2.1_clicked_offer_1';
  const context = new EventEmitter(); context.pages = () => [page]; context.close = async () => { contextCloseCalls++; };
  const session = { slot: 999, isObscura: true, engine: 'obscura', mainPage: page, browser: context,
    close: async () => { stopCalls++; if (stopFails) throw new Error('native stop failed'); session.isClosed = true; activeBrowsers.delete(session); context.emit('close'); } };
  activeBrowsers.add(session);
  Object.assign(autoRefill, { enabled: true, stopRequested: false });
  const { watchTrafficBlockedPage } = await loadFixture('src/leads/actions/watch-traffic-blocked-page.mjs', { recordProxyOutcome: async () => false }, t);
  watchTrafficBlockedPage(session);
  const deadline = Date.now() + 2000;
  while (!stopCalls && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
  assert.equal(stopCalls, 1); assert.equal(contextCloseCalls, 0);
  assert.equal(activeBrowsers.has(session), stopFails);
});
