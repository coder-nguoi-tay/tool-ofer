import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { attachCompleteTextWatcher } from '../src/browser/actions/attach-complete-text-watcher.mjs';
import { recordConfirmedLeadProgress } from '../src/leads/statistics/record-confirmed-lead-progress.mjs';
import { shouldSkipAiOnStuck } from '../src/ai-assist/should-skip-ai-on-stuck.mjs';
import { applicationState } from '../src/runtime/application-state.mjs';
import { leadIpStatsMap } from '../lead-check.mjs';

afterEach(() => { leadIpStatsMap.clear(); applicationState.saveLeadStatsTimer = null; });
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

test('Complete text: thấy chuỗi hoàn tất thì tăng bộ đếm Giới hạn và đóng phiên; phiên có lead thì giữ', async t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const savedCount = applicationState.limitRunCount;
  t.after(() => { applicationState.limitRunCount = savedCount; });
  let closes = 0;
  const logs = [];
  const page = { isClosed: () => false, evaluate: async (fn, needle) => needle === 'thank you' };
  attachCompleteTextWatcher({ addBrowserLog: entry => logs.push(entry) }, page, 'Thank You', () => { closes++; });
  t.mock.timers.tick(2000);
  await flush();
  assert.equal(closes, 1);
  assert.equal(applicationState.limitRunCount, savedCount + 1);
  assert.equal(logs[0].type, 'complete_text');
  const kept = { exitIp: '198.51.100.40', leadCheckStatus: 'confirmed' };
  attachCompleteTextWatcher(kept, page, 'thank you', () => { closes++; });
  t.mock.timers.tick(2000);
  await flush();
  assert.equal(closes, 1, 'không đóng phiên đã có lead');
  assert.equal(attachCompleteTextWatcher({}, page, '')(), undefined, 'không nhập chuỗi thì không dò');
});

test('tiến độ lead chỉ ghi khi IP đã có lead; thiếu màn thì lấy màn xa nhất phiên đã tới', () => {
  recordConfirmedLeadProgress({ exitIp: '198.51.100.41', leadCheckStatus: 'checking' }, 3, 4);
  assert.equal(leadIpStatsMap.size, 0);
  recordConfirmedLeadProgress({ exitIp: '198.51.100.41', leadCheckStatus: 'confirmed', completedScreens: 5 }, 7);
  const stats = leadIpStatsMap.get('198.51.100.41');
  assert.equal(stats.screen, 6);
  assert.equal(stats.jumpCount, 7);
});

test('AI bỏ qua trang không có form và gọi dồn cùng URL trong 4 giây', () => {
  const page = url => ({ url: () => url });
  for (const url of ['', 'about:blank', 'chrome://newtab', 'https://api.ipify.org/?format=json', 'https://toffers.top/click/?key=1']) assert.equal(shouldSkipAiOnStuck(page(url)), true, url);
  assert.equal(shouldSkipAiOnStuck({ ...page('https://offer.test/'), _aiAssistRunning: true }), true);
  const form = page('https://offer.test/form');
  assert.equal(shouldSkipAiOnStuck(form, 10_000), false);
  assert.equal(shouldSkipAiOnStuck(form, 12_000), true);
  assert.equal(shouldSkipAiOnStuck(form, 14_001), false);
});

test('canh tab mới: tab quảng cáo rác bị đóng, tab phụ lỗi mạng chỉ đóng tab đó, tab offer giữ nguyên', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { EventEmitter } = await import('node:events');
  const { attachExtraTabGuards } = await import('../src/browser/tabs/attach-extra-tab-guards.mjs');
  const context = new EventEmitter();
  const pages = [];
  context.pages = () => pages;
  const makePage = url => {
    const page = new EventEmitter();
    page.closed = false;
    Object.assign(page, { url: () => url, isClosed: () => page.closed, close: async () => { page.closed = true; }, bringToFront: async () => {}, frames: () => [], mainFrame: () => page, evaluate: async () => '' });
    pages.push(page);
    return page;
  };
  const main = makePage('https://offer.test/');
  const logs = [];
  const session = { mainPage: main, exitIp: '198.51.100.50', addBrowserLog: entry => logs.push(entry.type) };
  attachExtraTabGuards(context, session);
  const spam = makePage('https://play.google.com/store/apps/details?id=x');
  const offer = makePage('https://offer2.test/landing');
  const broken = makePage('chrome-error://chromewebdata/');
  for (const page of [spam, offer, broken]) context.emit('page', page);
  t.mock.timers.tick(3000);
  broken.emit('load');
  await flush();
  assert.equal(spam.closed, true);
  assert.equal(offer.closed, false);
  assert.equal(broken.closed, true);
  assert.equal(main.closed, false, 'không đóng cả trình duyệt');
  assert.deepEqual(logs.sort(), ['popup_closed', 'traffic_blocked']);
});

test('không mở offer khi trình duyệt ra Internet bằng IP thật của Mac; tra IP Mac lỗi thì không chặn', async () => {
  const { assertNotMacPublicIp } = await import('../src/proxy/actions/get-mac-public-ip.mjs');
  await assert.rejects(assertNotMacPublicIp('118.70.1.2', async () => '118.70.1.2'), error => error.code === 'MAC_IP_EXPOSED');
  await assertNotMacPublicIp('203.0.113.9', async () => '118.70.1.2');
  await assertNotMacPublicIp('203.0.113.9', async () => null);
  await assertNotMacPublicIp(null, async () => assert.fail('không có IP thì không cần tra'));
});

test('GoLogin chặn UDP WebRTC đi thẳng (không qua proxy) ở mọi chế độ chạy, như Chrome', async () => {
  const { buildGoLoginLaunchOptions } = await import('../src/gologin-profile/build-launch-options.mjs');
  for (const mode of [{ screenPreviewOnly: true }, { hideUntilTarget: true }, {}]) {
    assert.ok(buildGoLoginLaunchOptions(mode).extra_params.includes('--webrtc-ip-handling-policy=disable_non_proxied_udp'));
  }
});

test('chờ IP proxy ổn định: session mới đổi IP 2 lần rồi giữ cố định thì nhận IP cuối; lỗi hoặc không ổn định thì bỏ', async () => {
  const { waitForStableProxyIp } = await import('../src/proxy/actions/wait-for-stable-proxy-ip.mjs');
  const run = async (sequence, options = {}) => {
    let clock = 0, index = 0;
    const result = await waitForStableProxyIp({}, async () => sequence[Math.min(index++, sequence.length - 1)],
      { sleep: async ms => { clock += ms; }, now: () => clock, ...options });
    return { result, probes: index, waited: clock };
  };
  const A = { ip: '198.51.100.1' }, B = { ip: '198.51.100.2' }, C = { ip: '198.51.100.3' };
  // Đúng mẫu đo thật: giây 0 = A, giây 3/6 = B, từ giây 9 = C.
  const settled = await run([A, B, B, C, C, C]);
  assert.equal(settled.result.ip, C.ip);
  assert.ok(settled.waited >= 10_000, 'chưa qua 10 giây thì chưa nhận dù hai lần trùng');
  const already = await run([A, A, A, A, A]);
  assert.equal(already.result.ip, A.ip, 'session đã ổn định: nhận ngay khi đủ 10 giây');
  assert.equal((await run([A, null])).result, null, 'proxy lỗi giữa chừng thì bỏ');
  assert.equal((await run([null])).result, null);
  const flapping = await run(Array.from({ length: 20 }, (_, i) => ({ ip: `198.51.100.${10 + i}` })));
  assert.equal(flapping.result, null, 'quá 30 giây vẫn đổi IP thì bỏ proxy');
});
