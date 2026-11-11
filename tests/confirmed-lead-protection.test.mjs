import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { recoverConfirmedLeadErrorPage } from '../src/leads/actions/recover-confirmed-lead-error-page.mjs';
import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { protectConfirmedLeadSession } from '../src/leads/actions/protect-confirmed-lead-session.mjs';
import { startLeadVerification } from '../src/leads/actions/start-lead-verification.mjs';
import { watchTrafficBlockedPage } from '../src/leads/actions/watch-traffic-blocked-page.mjs';
import { getAutoRefillStatus } from '../src/refill/actions/get-auto-refill-status.mjs';
import { closeChromeWhenLastTabCloses } from '../src/browser/actions/close-chrome-when-last-tab-closes.mjs';
import { handlePostScreenReload } from '../src/http/routes/screen/post-reload.mjs';
import { handlePostBrowserClose } from '../src/http/routes/browser/post-close.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { screencastSessions } from '../src/runtime/constants/screencast-sessions.mjs';
import { applicationState } from '../src/runtime/application-state.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';
import { recordLeadIpStats, leadIpStatsMap } from '../lead-check.mjs';
import { createLeadTestSession, captureLeadWatcherTicks } from './helpers/lead-session-fixture.mjs';

const confirmedIp = '198.51.100.10';
const flushEvents = () => new Promise(resolve => setImmediate(resolve));
const createResponse = () => ({ writeHead() {}, end() {} });
afterEach(() => {
  activeBrowsers.clear();
  screencastSessions.clear();
  leadIpStatsMap.clear();
  applicationState.saveLeadStatsTimer = null;
  autoRefill.enabled = false;
  autoRefill.stopRequested = false;
});

/**
 * Chạy ngay nhịp chờ API, bỏ timer ghi thống kê để test không ghi dữ liệu thật.
 * @param {object} context Context của node:test.
 * @return {void} Đã cài đồng hồ giả cho test API lead.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function accelerateLeadCheck(context) {
  context.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    if (delay === 1000) queueMicrotask(callback);
    return 1;
  });
}

test('lead đã xác nhận được giữ cứng dù cờ tạm và lịch sử thống kê bị xoá', () => {
  const { session } = createLeadTestSession(confirmedIp);
  recordLeadIpStats({ ip: confirmedIp });
  assert.equal(protectConfirmedLeadSession(session), true);
  session.leadCheckStatus = 'failed';
  session.screen5LeadVerified = false;
  leadIpStatsMap.clear();
  assert.equal(protectConfirmedLeadSession(session), true);
  assert.equal(session.confirmedLeadIp, confirmedIp);
  assert.equal(session.leadCheckStatus, 'confirmed');
  assert.equal(session.screen5LeadVerified, true);
  const other = createLeadTestSession('198.51.100.20').session;
  other.confirmedLeadIp = confirmedIp;
  assert.equal(protectConfirmedLeadSession(other), false);
});

test('reload qua Screen View vào duplicate/thank-you/lỗi mạng vẫn giữ tab, browser và cờ lead', async (t) => {
  const ticks = captureLeadWatcherTicks(t);
  const { session, page, counters } = createLeadTestSession(confirmedIp);
  activeBrowsers.add(session);
  recordLeadIpStats({ ip: confirmedIp });
  screencastSessions.set(1, { page });
  watchTrafficBlockedPage(session);
  for (const url of [
    'https://toffers.top/error.php?error=ip_198.51.100.10_clicked_offer_1',
    'https://offer.test/thankyou.php',
    'https://adswapper.test/disabled.html',
    'chrome-error://chromewebdata/',
  ]) {
    session.leadCheckStatus = null;
    session.screen5LeadVerified = false;
    page.reloadUrl = url;
    await handlePostScreenReload({ method: 'POST', url: '/screen/reload/1' }, createResponse());
    ticks[0]();
    await flushEvents();
    assert.equal(getAutoRefillStatus().chromeSessions[0].leadCheckStatus, 'confirmed');
  }
  assert.equal(counters.pageCloses, 0);
  assert.equal(counters.browserCloses, 0);
  assert.equal(activeBrowsers.has(session), true);
});

test('IP chưa có lead dùng cùng gateway vẫn bị đóng khi duplicate, không ảnh hưởng browser có lead', async (t) => {
  captureLeadWatcherTicks(t);
  autoRefill.stopRequested = true;
  const kept = createLeadTestSession(confirmedIp);
  const rejected = createLeadTestSession('198.51.100.20', 2);
  recordLeadIpStats({ ip: confirmedIp });
  for (const fixture of [kept, rejected]) {
    fixture.session.proxyServer = 'http://gateway.test:10000';
    activeBrowsers.add(fixture.session);
    watchTrafficBlockedPage(fixture.session);
    fixture.page.currentUrl = 'https://toffers.top/error.php';
    fixture.page.emit('framenavigated');
  }
  await flushEvents();
  assert.equal(kept.counters.browserCloses, 0);
  assert.equal(rejected.counters.browserCloses, 1);
});

test('nhận lead trong lúc kiểm tra lỗi DOM thì huỷ quyết định tự đóng', async (t) => {
  const ticks = captureLeadWatcherTicks(t);
  const { session, page, counters } = createLeadTestSession(confirmedIp);
  page.evaluate = async () => { recordLeadIpStats({ ip: confirmedIp }); return 'ERR_PROXY_CONNECTION_FAILED'; };
  watchTrafficBlockedPage(session);
  ticks[0]();
  await flushEvents();
  assert.equal(counters.pageCloses, 0);
  assert.equal(counters.browserCloses, 0);
  assert.equal(session.leadCheckStatus, 'confirmed');
});

test('API xác nhận lead một lần; gọi kiểm tra lại sau reload không hạ cờ hoặc đóng browser', async (t) => {
  accelerateLeadCheck(t);
  const { session, counters } = createLeadTestSession(confirmedIp);
  activeBrowsers.add(session);
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ results: [{ ip: confirmedIp }] })));
  const config = { enabled: true, intervalSeconds: 1, maxAttempts: 1 };
  await startLeadVerification(session, config);
  assert.equal(session.confirmedLeadIp, confirmedIp);
  session.leadCheckStatus = 'checking';
  session.screen5LeadVerified = false;
  await startLeadVerification(session, config);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(session.leadCheckStatus, 'confirmed');
  assert.equal(counters.browserCloses, 0);
});

test('API đang chờ trả rỗng không được hạ cờ khi IP vừa có lead từ lượt khác', async (t) => {
  accelerateLeadCheck(t);
  const { session, counters } = createLeadTestSession(confirmedIp);
  activeBrowsers.add(session);
  t.mock.method(globalThis, 'fetch', async () => {
    recordLeadIpStats({ ip: confirmedIp });
    return new Response(JSON.stringify({ results: [] }));
  });
  await startLeadVerification(session, { enabled: true, intervalSeconds: 1, maxAttempts: 1 });
  assert.equal(session.leadCheckStatus, 'confirmed');
  assert.equal(counters.browserCloses, 0);
});

test('IP chưa từng có lead vẫn bị đóng khi API xác nhận không có lead', async (t) => {
  accelerateLeadCheck(t);
  const { session, counters } = createLeadTestSession('198.51.100.20');
  activeBrowsers.add(session);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ results: [] })));
  await startLeadVerification(session, { enabled: true, intervalSeconds: 1, maxAttempts: 1 });
  assert.equal(session.leadCheckStatus, 'failed');
  assert.equal(counters.browserCloses, 1);
});

test('tab cuối tự đóng khi chạy ngầm: giữ browser/IP có lead và tạo tab thay thế', async () => {
  const { session, page, counters } = createLeadTestSession(confirmedIp);
  session.isWindowVisible = false;
  recordLeadIpStats({ ip: confirmedIp });
  closeChromeWhenLastTabCloses(session);
  await page.close();
  await flushEvents();
  assert.equal(counters.browserCloses, 0);
  assert.equal(counters.newPages, 1);
  assert.notEqual(session.mainPage, page);
});

test('người dùng vẫn đóng chủ động được browser đã có lead', async () => {
  const { session, counters } = createLeadTestSession(confirmedIp);
  activeBrowsers.add(session);
  recordLeadIpStats({ ip: confirmedIp });
  protectConfirmedLeadSession(session);
  await handlePostBrowserClose({ method: 'POST', url: '/browser/close/1' }, createResponse());
  assert.equal(counters.browserCloses, 1);
  assert.equal(session.suppressAutoRefill, true);
});

test('lead của IP gateway không được gắn nhầm cho IP exit của trình duyệt', async (t) => {
  accelerateLeadCheck(t);
  const { session, counters } = createLeadTestSession('198.51.100.20');
  session.proxyServer = 'http://198.51.100.100:8080';
  activeBrowsers.add(session);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ results: [{ ip: '198.51.100.100' }] })));
  await startLeadVerification(session, { enabled: true, intervalSeconds: 1, maxAttempts: 1 });
  assert.equal(session.leadCheckStatus, 'unmatched');
  assert.equal(protectConfirmedLeadSession(session), false);
  assert.equal(counters.browserCloses, 1);
});

test('lỗi hiển thị cửa sổ sau khi có lead không được hạ cờ confirmed', async (t) => {
  accelerateLeadCheck(t);
  const { session, counters } = createLeadTestSession(confirmedIp);
  session.showWindow = async () => { throw new Error('window unavailable'); };
  activeBrowsers.add(session);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ results: [{ ip: confirmedIp }] })));
  await startLeadVerification(session, { enabled: true, intervalSeconds: 1, maxAttempts: 1 });
  assert.equal(session.leadCheckStatus, 'confirmed');
  assert.equal(session.screen5LeadVerified, true);
  assert.equal(counters.browserCloses, 0);
});

test('lệnh Close trong script tự động bỏ qua browser có lead nhưng vẫn đóng phiên chưa có lead', async () => {
  const { runScript } = await import('../script.mjs');
  const kept = createLeadTestSession(confirmedIp);
  const fresh = createLeadTestSession('198.51.100.20');
  recordLeadIpStats({ ip: confirmedIp });
  await runScript(kept.page, [{ cmd: 'Close', arg: '' }], {}, { session: kept.session });
  await runScript(fresh.page, [{ cmd: 'Close', arg: '' }], {}, { session: fresh.session });
  assert.equal(kept.counters.pageCloses, 0);
  assert.equal(fresh.counters.pageCloses, 1);
});


test('watcher quay lại trang trước cho IP có lead rồi đánh thức autofill, không đóng browser', async t => {
  captureLeadWatcherTicks(t);
  const { session, page, counters } = createLeadTestSession(confirmedIp);
  session.leadCheckStatus = 'confirmed';
  session.hasSubmittedCurrentScreen = true;
  page.currentUrl = 'https://toffers.top/error.php';
  let backs = 0, scans = 0;
  page.goBack = async () => { backs++; page.currentUrl = 'https://offer.test/form'; return null; };
  page.triggerAutofillScan = () => { assert.equal(page._leadRecoveryInProgress, false); scans++; };
  watchTrafficBlockedPage(session);
  await flushEvents();
  assert.equal(backs, 1);
  assert.equal(scans, 1);
  assert.equal(session.hasSubmittedCurrentScreen, false);
  assert.equal(session.confirmedLeadIp, confirmedIp);
  assert.equal(session.leadCheckStatus, 'confirmed');
  assert.equal(counters.browserCloses + counters.pageCloses, 0);
});

test('phục hồi không có history: giữ browser, chống Back đồng thời và chờ 15s trước lần kế', async () => {
  const { session, page, counters } = createLeadTestSession(confirmedIp);
  session.leadCheckStatus = 'confirmed';
  page.currentUrl = 'chrome-error://chromewebdata/';
  let backs = 0, scans = 0, release;
  page.goBack = () => { backs++; return new Promise(resolve => { release = resolve; }); };
  page.triggerAutofillScan = () => { scans++; };
  const recovery = recoverConfirmedLeadErrorPage(session, page);
  await flushEvents();
  await recoverConfirmedLeadErrorPage(session, page);
  assert.equal(page._leadRecoveryInProgress, true);
  assert.equal(backs, 1);
  release(null); await recovery;
  await recoverConfirmedLeadErrorPage(session, page);
  assert.equal(backs, 1);
  assert.equal(scans, 0);
  assert.equal(counters.browserCloses + counters.pageCloses, 0);
});

test('lead của IP cũ không chuyển cờ bảo vệ sang IP mới trong lúc Back', async () => {
  const { session, page } = createLeadTestSession(confirmedIp);
  session.leadCheckStatus = 'confirmed';
  page.currentUrl = 'chrome-error://chromewebdata/';
  let scans = 0;
  page.goBack = async () => { session.exitIp = '198.51.100.99'; page.currentUrl = 'https://offer.test/form'; };
  page.triggerAutofillScan = () => { scans++; };
  await recoverConfirmedLeadErrorPage(session, page);
  assert.equal(protectConfirmedLeadSession(session), false);
  assert.equal(session.confirmedLeadIp, confirmedIp);
  assert.equal(scans, 0);
});


test('HTTP 500 quay lại form thật và điền tiếp, giữ nguyên IP/cờ lead', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, '<form><input name="firstname"><button data-ux-submitted="1" data-ux-submit-count="3">Continue</button></form>');
  t.after(() => context.close());
  await context.route('**/error', route => route.fulfill({ status: 500, contentType: 'text/html', body: '<h1>Internal Server Error</h1>' }));
  Object.assign(session, { exitIp: confirmedIp, confirmedLeadIp: confirmedIp, leadCheckStatus: 'checking', slot: 2, hasSubmittedCurrentScreen: true });
  await page.goto('https://form-scope.test/error');
  page._uxMainStatus = 500;
  let scan;
  page.triggerAutofillScan = () => { scan = fillPageForms(page, { session, sessionRecord: { firstname: 'Ada' }, options: { autoSubmit: false, enableLeadCheck: false }, triggerLeadCheckAfterEmail() {} }); };
  assert.equal(await recoverConfirmedLeadErrorPage(session, page), true);
  assert.ok(scan, 'Trang khỏe phải được đánh thức để tiếp tục autofill');
  await scan;
  assert.equal(await page.locator('input').inputValue(), 'Ada');
  assert.equal(await page.locator('button').getAttribute('data-ux-submitted'), null);
  assert.equal(session.confirmedLeadIp, confirmedIp);
  assert.equal(session.leadCheckStatus, 'confirmed');
  assert.equal(page.isClosed(), false);
  assert.equal(browser.isConnected(), true);
});

test('cùng lỗi không có history chỉ thử Back tối đa ba lần rồi giữ mở', async t => {
  const { session, page, counters } = createLeadTestSession(confirmedIp);
  session.leadCheckStatus = 'confirmed';
  page.currentUrl = 'chrome-error://chromewebdata/';
  let clock = Date.now(), backs = 0;
  t.mock.method(Date, 'now', () => clock);
  page.goBack = async () => { backs++; return null; };
  for (let attempt = 0; attempt < 5; attempt++) {
    await recoverConfirmedLeadErrorPage(session, page);
    clock += 16_000;
  }
  assert.equal(backs, 3);
  assert.equal(counters.browserCloses + counters.pageCloses, 0);
});


test('iframe quảng cáo lỗi không làm browser có lead quay khỏi form chính đang hoạt động', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, '<form><input name="firstname"></form><iframe srcdoc="ERR_CONNECTION_REFUSED"></iframe>');
  t.after(() => context.close());
  Object.assign(session, { exitIp: confirmedIp, leadCheckStatus: 'confirmed' });
  const url = page.url();
  assert.equal(await recoverConfirmedLeadErrorPage(session, page), false);
  assert.equal(page.url(), url);
  assert.equal(page.isClosed(), false);
});


test('Back ném lỗi: nhả khóa phục hồi, giữ IP có lead và không đóng trang', async () => {
  const { session, page, counters } = createLeadTestSession(confirmedIp);
  session.leadCheckStatus = 'confirmed';
  page.currentUrl = 'chrome-error://chromewebdata/';
  page.goBack = async () => { throw new Error('navigation timeout'); };
  assert.equal(await recoverConfirmedLeadErrorPage(session, page), true);
  assert.equal(page._leadRecoveryInProgress, false);
  assert.equal(protectConfirmedLeadSession(session), true);
  assert.equal(counters.browserCloses + counters.pageCloses, 0);
});
