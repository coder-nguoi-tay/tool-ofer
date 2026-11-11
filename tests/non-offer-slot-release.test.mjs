import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { isExitIpConsumed, closeHistoryStatus } from '../src/proxy/actions/is-exit-ip-consumed.mjs';
import { pickRefillOfferRoles } from '../src/refill/actions/pick-refill-offer-roles.mjs';
import { getNonOfferReason } from '../src/leads/actions/get-non-offer-reason.mjs';
import { watchTrafficBlockedPage } from '../src/leads/actions/watch-traffic-blocked-page.mjs';
import { createLeadTestSession, captureLeadWatcherTicks } from './helpers/lead-session-fixture.mjs';
import { isSessionWorkingOnOffer } from '../src/leads/actions/is-session-working-on-offer.mjs';
import { addActionCount } from '../src/autofill/add-action-count.mjs';
import { addVerifiedFieldCount } from '../src/autofill/add-verified-field-count.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { startLeadVerification } from '../src/leads/actions/start-lead-verification.mjs';
import { detectOfferContentInPage } from '../src/leads/actions/detect-offer-content-in-page.mjs';

const EMPTY = { challenge: false, worked: false, hasForm: false, hasChoices: false };

/**
 * Tab giả: URL đổi được, mỗi frame trả kết quả nhận diện cố định (hoặc reject).
 * @param {string} url URL ban đầu.
 * @param {Array<object|Error>} frameResults Kết quả detectOfferContentInPage của từng frame.
 * @return {object} Tab giả.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function fakeTab(url, frameResults = [EMPTY]) {
  const tab = { currentUrl: url, isClosed: () => false };
  tab.url = () => tab.currentUrl;
  tab.frames = () => frameResults.map(r => ({ evaluate: async () => { if (r instanceof Error) throw r; return r; } }));
  return tab;
}

/**
 * Gọi getNonOfferReason tại một thời điểm giả.
 * @param {object} t Context node:test.
 * @return {(tab: object, tracker: object, at: number) => Promise<string|null>} Hàm gọi theo mốc thời gian.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function clockedReason(t) {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  return (tab, tracker, at) => { now = at; return getNonOfferReason(tab, tracker); };
}

test('pickRefillOfferRoles: bù vào offer đang thiếu, hòa thì offer nhỏ nhất', () => {
  assert.deepEqual(pickRefillOfferRoles([{ offerNumber: 1 }, { offerNumber: 1 }, { offerNumber: 2 }], 2, 1), [2]);
  assert.deepEqual(pickRefillOfferRoles([], 3, 4), [1, 2, 3, 1]);
  assert.deepEqual(pickRefillOfferRoles([{ streamRole: 2 }], 2, 1), [1]);
  assert.deepEqual(pickRefillOfferRoles([{}], 2, 1), [2]);
});

test('getNonOfferReason: offer hết hạn, trang trắng, HTTP lỗi, không form', async t => {
  const at = clockedReason(t);
  assert.equal(await at(fakeTab('https://404offer.com/x'), { url: '', since: 0 }, 0), 'Offer hết hạn (trang unavailable)');

  const blank = fakeTab('about:blank');
  const blankTracker = { url: '', since: 0 };
  assert.equal(await at(blank, blankTracker, 1000), null);
  assert.equal(await at(blank, blankTracker, 1000 + 19_999), null);
  assert.equal(await at(blank, blankTracker, 1000 + 20_000), 'Trang trắng (about:blank) không tải offer');

  const http = fakeTab('https://err.test/x');
  http._uxMainStatus = 404;
  const httpTracker = { url: '', since: 0 };
  assert.equal(await at(http, httpTracker, 0), null);
  assert.equal(await at(http, httpTracker, 10_000), 'Trang lỗi HTTP 404');

  const httpWithQuestion = fakeTab('https://err.test/form', [{ ...EMPTY, hasForm: true }]);
  httpWithQuestion._uxMainStatus = 404;
  const questionTracker = { url: '', since: 0 };
  assert.equal(await at(httpWithQuestion, questionTracker, 0), null);
  assert.equal(await at(httpWithQuestion, questionTracker, 10_000), null, 'form/câu hỏi được giữ dù HTTP trả lỗi');

  const empty = fakeTab('https://news.test/a');
  const emptyTracker = { url: '', since: 0 };
  assert.equal(await at(empty, emptyTracker, 0), null);
  assert.equal(await at(empty, emptyTracker, 29_999), null);
  assert.equal(await at(empty, emptyTracker, 30_000), 'Trang không có form nhập / đáp án để chọn');
});

test('getNonOfferReason: giữ tab có form trong iframe, frame không đọc được, trang trung gian', async t => {
  const at = clockedReason(t);
  const keep = async (tab) => {
    const tracker = { url: '', since: 0 };
    await at(tab, tracker, 0);
    return at(tab, tracker, 60_000);
  };
  assert.equal(await keep(fakeTab('https://offer.test/a', [EMPTY, { ...EMPTY, hasForm: true }])), null);
  assert.equal(await keep(fakeTab('https://offer.test/a', [new Error('detached')])), null);
  assert.equal(await keep(fakeTab('https://offer.test/a', [{ ...EMPTY, worked: true }])), null);
  for (const url of ['https://api.ipify.org/?format=json', 'https://toffers.top/c/1', 'https://go.adtrapper.test/r']) {
    assert.equal(await keep(fakeTab(url)), null, url);
  }
});

test('getNonOfferReason: đổi query/hash không reset đồng hồ, đổi path thì reset', async t => {
  const at = clockedReason(t);
  const tab = fakeTab('https://ads.test/a?x=1');
  const tracker = { url: '', since: 0 };
  assert.equal(await at(tab, tracker, 0), null);
  tab.currentUrl = 'https://ads.test/a?x=2#b';
  assert.equal(await at(tab, tracker, 30_000), 'Trang không có form nhập / đáp án để chọn');
  tab.currentUrl = 'https://ads.test/b';
  assert.equal(await at(tab, tracker, 31_000), null);
});

/**
 * Response điều hướng giả của main frame.
 * @param {object} tab Tab nhận response.
 * @param {number} status Mã HTTP.
 * @return {object} Response giả.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
const navResponse = (tab, status) => ({ request: () => ({ isNavigationRequest: () => true }), frame: () => tab, status: () => status });

test('watcher: ghi HTTP status của tab mới ngay khi tab mở, trước nhịp kiểm tra đầu', async t => {
  const ticks = captureLeadWatcherTicks(t);
  // Không gán proxyKey: watcher không được ghi vào lịch sử proxy thật của app.
  const { session, page, browser } = createLeadTestSession('198.51.100.30');
  watchTrafficBlockedPage(session);
  page.emit('response', navResponse(page, 502));
  const popup = await browser.newPage();
  popup.emit('response', navResponse(popup, 404));
  assert.equal(ticks.length, 1);
  assert.equal(page._uxMainStatus, 502);
  assert.equal(popup._uxMainStatus, 404);
});

test('isSessionWorkingOnOffer: chỉ đang check lead hoặc hành động trong 30s gần nhất', () => {
  assert.equal(isSessionWorkingOnOffer({ leadCheckStatus: 'checking' }, 1e9), true);
  for (const status of ['api_error', 'unmatched', 'failed']) {
    assert.equal(isSessionWorkingOnOffer({ leadCheckStatus: status }, 1e9), false, status);
  }
  assert.equal(isSessionWorkingOnOffer({ _uxLastActionAt: 1e9 - 29_999 }, 1e9), true);
  assert.equal(isSessionWorkingOnOffer({ _uxLastActionAt: 1e9 - 30_000, autofillActions: 9, autofillFields: 3, emailFilled: true, completedScreens: 2 }, 1e9), false);
  assert.equal(isSessionWorkingOnOffer({}, 1e9), false);
});

test('addActionCount/addVerifiedFieldCount ghi mốc hành động, amount 0 thì không', t => {
  t.mock.method(Date, 'now', () => 5000);
  const a = {};
  addActionCount(a, 0);
  assert.equal(a._uxLastActionAt, undefined);
  addActionCount(a);
  assert.equal(a._uxLastActionAt, 5000);
  const b = {};
  addVerifiedFieldCount(b, 2);
  assert.equal(b._uxLastActionAt, 5000);
  assert.equal(b.autofillFields, 2);
});

/**
 * Phiên giả: tab chính đã tự đóng (tuỳ chọn), còn một popup trang tin không form.
 * Không gán proxyKey để watcher không ghi lịch sử proxy thật.
 * @param {object} t Context node:test.
 * @param {{mainClosed?: boolean}} options Tab chính đã đóng hay chưa.
 * @return {Promise<object>} Phiên, bộ đếm, hàm chạy nhịp tại mốc thời gian.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function popupOnlySession(t, { mainClosed = true } = {}) {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const ticks = captureLeadWatcherTicks(t);
  const fixture = createLeadTestSession('198.51.100.40');
  const emptyFrames = () => [{ evaluate: async () => EMPTY }];
  fixture.page.currentUrl = 'https://news.test/home';
  fixture.page.frames = emptyFrames;
  let popup = null;
  if (mainClosed) {
    fixture.page.closed = true;
    popup = await fixture.browser.newPage();
    popup.currentUrl = 'https://news.test/story';
    popup.frames = emptyFrames;
  }
  const flush = async () => { for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve)); };
  watchTrafficBlockedPage(fixture.session);
  const tickAt = async at => { now = at; ticks[0](); await flush(); };
  return { ...fixture, popup, tickAt };
}

test('watcher: đã tắt non-offer, popup trống là tab duy nhất vẫn được giữ', async t => {
  autoRefill.enabled = false;
  const { session, counters, tickAt } = await popupOnlySession(t);
  session.autofillActions = 5;
  session._uxLastActionAt = -100_000;
  await tickAt(0);
  assert.equal(counters.browserCloses, 0);
  await tickAt(600_000);
  assert.equal(counters.browserCloses, 0);
  assert.equal(counters.pageCloses, 0);
  assert.equal(session.closingDueToTrafficBlocked, undefined);
  activeBrowsers.clear();
});

test('watcher: popup trống là tab duy nhất nhưng đang check lead hoặc vừa thao tác → giữ', async t => {
  autoRefill.enabled = false;
  const checking = await popupOnlySession(t);
  checking.session.leadCheckStatus = 'checking';
  await checking.tickAt(0);
  await checking.tickAt(60_000);
  assert.equal(checking.counters.browserCloses, 0);
  t.mock.restoreAll();
  const recent = await popupOnlySession(t);
  recent.session.autofillActions = 1;
  recent.session._uxLastActionAt = 45_000;
  await recent.tickAt(0);
  await recent.tickAt(60_000);
  assert.equal(recent.counters.browserCloses, 0);
});

test('watcher: tab chính trang không form bao lâu cũng không bị đóng (phạm vi đã chốt)', async t => {
  autoRefill.enabled = false;
  const { counters, tickAt } = await popupOnlySession(t, { mainClosed: false });
  await tickAt(0);
  await tickAt(600_000);
  assert.equal(counters.browserCloses, 0);
  assert.equal(counters.pageCloses, 0);
});

test('watcher: popup lỗi mạng khi còn tab chính → chỉ đóng popup và đánh dấu app đóng', async t => {
  autoRefill.enabled = false;
  const { counters, tickAt, browser } = await popupOnlySession(t, { mainClosed: false });
  const popup = await browser.newPage();
  popup.currentUrl = 'chrome-error://chromewebdata/';
  await tickAt(0);
  assert.equal(popup.closed, true);
  assert.ok(popup._uxClosedByApp, 'tab do app đóng không được bị hiểu là người dùng bấm X');
  assert.equal(counters.browserCloses, 0);
});

test('detectOfferContentInPage: dấu autofill, ô ở nav, ô email', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const detect = async html => { await page.setContent(html); return page.evaluate(detectOfferContentInPage); };
  for (const marker of ['data-ux-opened', 'data-ux-mui-clicked', 'data-ux-soi-done', 'data-ux-ow-clicked', 'data-ux-autofill-owner', 'data-ux-typing', 'data-ux-semantic-answered', 'data-ux-answer-attempt-at']) {
    const result = await detect(`<div ${marker}="1">Offer A</div>`);
    assert.equal(result.worked, true, marker);
    assert.equal(result.hasForm, false, marker);
  }
  assert.deepEqual(await detect('<nav><input type="text"></nav><p>news</p>'), EMPTY);
  assert.equal((await detect('<input type="email">')).hasForm, true);
});

test('isExitIpConsumed: IP đã click offer vẫn bị chặn, lỗi proxy thì không', () => {
  for (const status of ['success', 'duplicate_ip', 'offer_unavailable', 'completed']) {
    assert.equal(isExitIpConsumed({ exitIp: '1.2.3.4', status }), true, status);
  }
  for (const status of ['failed', 'verification_error']) {
    assert.equal(isExitIpConsumed({ exitIp: '1.2.3.4', status }), false, status);
  }
  assert.equal(isExitIpConsumed({ status: 'success' }), false);
});

test('closeHistoryStatus: duplicate, trang không phải offer, lỗi khác', () => {
  assert.equal(closeHistoryStatus('IP đã click offer trước đó (Toffers Duplicate IP)', false), 'duplicate_ip');
  assert.equal(closeHistoryStatus('Trang không có form nhập / đáp án để chọn', true), 'offer_unavailable');
  assert.equal(closeHistoryStatus('Offer hết hạn (trang unavailable)', true), 'offer_unavailable');
  assert.equal(closeHistoryStatus('Traffic Blocked!', false), 'failed');
  assert.equal(closeHistoryStatus('ERR_CONNECTION_RESET', false), 'failed');
});

test('pickRefillOfferRoles: bỏ qua offer không đủ điều kiện (skip), không còn offer nào thì rỗng', () => {
  const notSkip = k => k !== 3;
  assert.deepEqual(pickRefillOfferRoles([{ offerNumber: 1 }, { offerNumber: 2 }], 3, 2, notSkip), [1, 2]);
  assert.deepEqual(pickRefillOfferRoles([], 2, 2, () => false), []);
});

test('getNonOfferReason: trang cùng path chỉ bị đóng khi trống liên tục 30s (SPA chuyển bước)', async t => {
  const at = clockedReason(t);
  let content = { ...EMPTY, hasForm: true };
  const tab = fakeTab('https://child.test/survey?step=1');
  tab.frames = () => [{ evaluate: async () => content }];
  const tracker = { url: '', since: 0 };
  assert.equal(await at(tab, tracker, 0), null);
  assert.equal(await at(tab, tracker, 40_000), null); // có form: giữ, đồng hồ bắt đầu lại
  content = EMPTY; // màn loading giữa hai bước
  tab.currentUrl = 'https://child.test/survey?step=2';
  assert.equal(await at(tab, tracker, 41_000), null);
  assert.equal(await at(tab, tracker, 69_999), null);
  assert.equal(await at(tab, tracker, 70_000), 'Trang không có form nhập / đáp án để chọn');
});

test('isSessionWorkingOnOffer: tính cả lastActionTime (AI, handler survey) và giữ khi người dùng tắt tự đóng hết lead', () => {
  assert.equal(isSessionWorkingOnOffer({ lastActionTime: 1e9 - 1000 }, 1e9), true);
  assert.equal(isSessionWorkingOnOffer({ lastActionTime: 1e9 - 30_000 }, 1e9), false);
  assert.equal(isSessionWorkingOnOffer({ leadCheckStatus: 'failed', keepOpenAfterLeadCheck: true }, 1e9), true);
});

test('startLeadVerification: hết lead với autoCloseNoLead=false đánh dấu giữ phiên', async t => {
  t.mock.method(globalThis, 'setTimeout', (callback, delay) => {
    if (delay === 1000) queueMicrotask(callback);
    return 1;
  });
  const { session, counters } = createLeadTestSession('198.51.100.50');
  activeBrowsers.add(session);
  t.after(() => activeBrowsers.clear());
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ results: [] })));
  await startLeadVerification(session, { enabled: true, intervalSeconds: 1, maxAttempts: 1, autoCloseNoLead: false });
  assert.equal(session.leadCheckStatus, 'failed');
  assert.equal(counters.browserCloses, 0);
  assert.equal(session.keepOpenAfterLeadCheck, true);
  assert.equal(isSessionWorkingOnOffer(session), true);
});

test('thankyou: tab đầu tới thankyou khi còn popup → không đóng riêng tab đầu, hoàn tất cả phiên', async t => {
  autoRefill.enabled = false;
  const { session, page, browser, counters, tickAt } = await popupOnlySession(t, { mainClosed: false });
  const popup = await browser.newPage();
  popup.currentUrl = 'https://offer.test/form';
  page.currentUrl = 'https://offer.test/thankyou.php';
  await tickAt(0);
  assert.equal(page._uxClosedByApp, undefined, 'app không được đóng riêng tab đầu');
  assert.equal(counters.browserCloses, 1);
  assert.equal(session.closingDueToTrafficBlocked, true);
  activeBrowsers.clear();
});

test('thankyou: popup tới thankyou khi còn tab đầu → chỉ đóng popup', async t => {
  autoRefill.enabled = false;
  const { page, browser, counters, tickAt } = await popupOnlySession(t, { mainClosed: false });
  const popup = await browser.newPage();
  popup.currentUrl = 'https://offer.test/thankyou.php';
  await tickAt(0);
  assert.equal(popup.closed, true);
  assert.equal(page.closed, false);
  assert.equal(counters.browserCloses, 0);
});
