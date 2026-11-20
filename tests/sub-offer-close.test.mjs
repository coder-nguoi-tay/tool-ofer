import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { attachFrameRequestTracking, hasPendingFrameRequests } from '../src/browser/frames/pending-frame-requests.mjs';
import { getEmptyOfferPageReason } from '../src/leads/actions/get-empty-offer-page-reason.mjs';
import { matchSubOfferCloseReason, readSubOfferCloseReason } from '../src/leads/actions/get-sub-offer-close-reason.mjs';
import { watchTrafficBlockedPage } from '../src/leads/actions/watch-traffic-blocked-page.mjs';
import { createLeadTestSession, captureLeadWatcherTicks } from './helpers/lead-session-fixture.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';

afterEach(() => { activeBrowsers.clear(); autoRefill.enabled = false; });

/**
 * Kiểm tra khoảng chờ đóng tab bằng request đang mở trên Chromium, chỉ trả dữ liệu tại fixture.
 * @param {import('node:test').TestContext} t Ngữ cảnh dọn browser và điều khiển đồng hồ kiểm thử.
 * @return {Promise<void>} Hoàn tất sau khi iframe biến mất và hết thời gian chờ.
 * @throws {Error} Khi trạng thái request hoặc thời điểm đóng tab sai.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function verifyDeferredIframe(t) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  attachFrameRequestTracking(context);
  const page = await context.newPage();
  const other = await context.newPage();
  const url = 'https://document.test/';
  let releaseResponse;
  const delayedResponse = new Promise(resolve => { releaseResponse = resolve; });
  t.after(releaseResponse);
  await context.route('**/*', async route => {
    if (route.request().url() === url + 'content') {
      await delayedResponse;
      return route.fulfill({ body: 'ready' });
    }
    return route.fulfill({ contentType: 'text/html', body: '<main><h1>Fixture</h1></main>' });
  });
  await page.goto(url);
  const started = page.waitForRequest(url + 'content');
  await page.evaluate(() => {
    void fetch('/content').then(response => response.text()).then(() => {
      const frame = document.createElement('iframe');
      frame.srcdoc = '<main><input aria-label="Feedback"></main>';
      document.querySelector('main').append(frame);
    });
  });
  await started;
  assert.equal(await page.evaluate(() => document.readyState), 'complete');
  assert.equal(hasPendingFrameRequests(page, page.mainFrame()), true);
  assert.equal(hasPendingFrameRequests(other), false);
  const tracker = { key: url, since: Date.now() - 31_000 };
  assert.equal(await getEmptyOfferPageReason(page, tracker, { subTab: true }), null);
  assert.equal(tracker.since, undefined);
  releaseResponse();
  await page.frameLocator('iframe').locator('input').waitFor();
  assert.equal(hasPendingFrameRequests(page), false);
  assert.equal(await getEmptyOfferPageReason(page, tracker, { subTab: true }), null);
  await page.locator('iframe').evaluate(frame => frame.remove());
  const settledTime = Date.now();
  const clock = t.mock.method(Date, 'now', () => settledTime);
  assert.equal(await getEmptyOfferPageReason(page, tracker, { subTab: true }), null);
  clock.mock.mockImplementation(() => settledTime + 31_000);
  assert.match(await getEmptyOfferPageReason(page, tracker, { subTab: true }), /hết form/);
}

test('tab phụ chờ fetch tạo iframe sau khi trang cha complete, rồi tính lại thời gian khi hết nội dung',
  { skip: !existsSync(chromium.executablePath()) }, verifyDeferredIframe);

test('chrome-error của offer phụ nhận diện từ URL, không đợi đọc DOM bị lỗi', async () => {
  assert.match(await readSubOfferCloseReason({ url: () => 'chrome-error://chromewebdata/', evaluate: () => assert.fail('Không đọc DOM của trang lỗi') }), /chrome-error/);
  for (const url of ['https://chromewebdata/', 'chrome-error://other/', 'https://offer.test/?next=chrome-error://chromewebdata/']) assert.equal(matchSubOfferCloseReason({ url }), null);
});

test('offer phụ chrome-error của IP có lead được đóng, không bị nhánh Back tức thời giành xử lý', async t => {
  const ticks = captureLeadWatcherTicks(t);
  const { session, browser, page, counters } = createLeadTestSession('198.51.100.124');
  session.leadCheckStatus = 'confirmed';
  const popup = await browser.newPage();
  popup.currentUrl = 'chrome-error://chromewebdata/';
  let backs = 0;
  popup.goBack = async () => { backs++; popup.currentUrl = 'https://offer.test/previous'; return null; };
  watchTrafficBlockedPage(session);
  for (let index = 0; index < 15; index++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(backs, 0);
  ticks[0]();
  for (let index = 0; index < 20; index++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(popup.closed, true);
  assert.equal(page.closed, false);
  assert.equal(counters.browserCloses, 0);
});

test('quy tắc đóng tab offer phụ: hết offer, chờ xác minh email, lifepointspanel', () => {
  assert.match(matchSubOfferCloseReason({ url: 'https://www.searchcactus.com/x', text: 'This offer is no longer available.' }), /no longer available/i);
  assert.match(matchSubOfferCloseReason({ url: 'https://app.example.com/verify', text: 'Please check your email' }), /check your email/i);
  assert.match(matchSubOfferCloseReason({ url: 'https://start.lifepointspanel.com/aff_c?offer_id=1807&aff_id=1610', text: '' }), /lifepointspanel/i);
  assert.match(matchSubOfferCloseReason({ url: 'https://www.lifepointspanel.com/en-us/signup', text: '' }), /lifepointspanel/i);
  assert.equal(matchSubOfferCloseReason({ url: 'https://offer.example.com/form', text: 'Enter your email to continue' }), null);
  assert.equal(matchSubOfferCloseReason({ url: 'https://evil.test/?u=lifepointspanel.com', text: '' }), null);
  // Quy tắc 2026-11-13: trang chủ yougov.com và landing "earn" của super.com → đóng; form khảo sát account.yougov.com giữ.
  assert.match(matchSubOfferCloseReason({ url: 'https://yougov.com/', text: '' }), /yougov/i);
  assert.match(matchSubOfferCloseReason({ url: 'https://www.yougov.com/', text: '' }), /yougov/i);
  assert.match(matchSubOfferCloseReason({ url: 'https://www.super.com/home/landings/earn?irclickid=X&intent=earn_dsp', text: '' }), /super\.com/i);
  assert.equal(matchSubOfferCloseReason({ url: 'https://account.yougov.com/us-en/join/new/question-2', text: '' }), null);
  assert.equal(matchSubOfferCloseReason({ url: 'https://www.super.com/checkout', text: '' }), null);
});

/**
 * Popup đã tải xong, không có form/câu hỏi, hiển thị thông báo của fixture.
 * @param {object} browser Browser giả của fixture.
 * @param {string} url URL popup.
 * @param {string} text Chữ hiển thị.
 * @return {Promise<object>} Tab popup.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function openPopup(browser, url, text) {
  const popup = await browser.newPage();
  popup.currentUrl = url;
  popup.evaluate = async fn => fn?.name === 'readSubOfferText' ? text :
    fn?.name === 'detectOfferContentInPage' ? { loading: false, hasForm: false, hasChoices: false, hasQuestion: false } : null;
  popup.frames = () => [popup];
  return popup;
}

for (const [name, url, text] of [
  ['chrome-error', 'chrome-error://chromewebdata/', ''],
  ['hết offer', 'https://www.searchcactus.com/offer', 'This offer is no longer available.'],
  ['chờ xác minh email', 'https://app.example.com/verify', 'Please check your email'],
  ['lifepointspanel', 'https://start.lifepointspanel.com/aff_c?offer_id=1807&aff_id=1610', ''],
]) {
  test(`watcher: tab offer phụ (${name}) bị đóng, tab đầu và trình duyệt giữ nguyên`, async t => {
    const ticks = captureLeadWatcherTicks(t);
    const { session, page, browser, counters } = createLeadTestSession('198.51.100.120');
    page.evaluate = async fn => (fn?.name === 'readSubOfferText' ? 'Main offer form' : null);
    const popup = await openPopup(browser, url, text);
    watchTrafficBlockedPage(session);
    ticks[0]();
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
    assert.equal(popup.closed, true);
    assert.ok(popup._uxClosedByApp, 'đánh dấu tab do app đóng');
    assert.equal(page.closed, false);
    assert.equal(counters.browserCloses, 0);
  });
}

test('watcher: tab đầu có chữ "This offer is no longer available." không bị đóng riêng', async t => {
  const ticks = captureLeadWatcherTicks(t);
  const { session, page, counters } = createLeadTestSession('198.51.100.121');
  page.currentUrl = 'https://start.lifepointspanel.com/aff_c?offer_id=1807';
  page.evaluate = async fn => (fn?.name === 'readSubOfferText' ? 'This offer is no longer available.' : null);
  watchTrafficBlockedPage(session);
  ticks[0]();
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(page.closed, false);
  assert.equal(counters.pageCloses, 0);
  assert.equal(counters.browserCloses, 0);
});

// Log 2026-11-13 00:02 (slot 2): tab lifepointspanel 404 mở sau khi đã có lead nhưng không bị đóng —
// watcher return sớm ở nhánh bảo vệ phiên có lead, trước khi tới đoạn đóng tab offer phụ.
test('watcher: phiên ĐÃ CÓ LEAD vẫn đóng tab offer phụ (lifepointspanel / "no longer available"), tab đầu giữ nguyên', async t => {
  const ticks = captureLeadWatcherTicks(t);
  const { session, page, browser, counters } = createLeadTestSession('198.51.100.122');
  session.leadCheckStatus = 'confirmed';
  page.currentUrl = 'https://financialhelpfinder.com/thankyou.php';
  page.evaluate = async fn => (fn?.name === 'readSubOfferText' ? 'Thank you' : null);
  const lifepoints = await openPopup(browser, 'https://start.lifepointspanel.com/aff_c?offer_id=1807&aff_id=1610', '');
  const gone = await openPopup(browser, 'https://www.searchcactus.com/publisher/trackofr.asp?chnl=221341&ofr=1089163', 'This offer is no longer available.');
  const networkError = await openPopup(browser, 'chrome-error://chromewebdata/', '');
  networkError._manualCaptchaPending = true;
  const live = await openPopup(browser, 'https://account.yougov.com/us-en/join/new/question-2', 'What is your gender?');
  watchTrafficBlockedPage(session);
  ticks[0]();
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(lifepoints.closed, true, 'lifepointspanel bị đóng');
  assert.equal(gone.closed, true, 'trang hết offer bị đóng');
  assert.equal(networkError.closed, true, 'tab phụ chrome-error bị đóng dù IP có lead');
  assert.equal(live.closed, false, 'offer phụ đang làm giữ nguyên');
  assert.equal(page.closed, false, 'tab đầu giữ nguyên');
  assert.equal(counters.browserCloses, 0);
});

test('watcher: tab phụ chỉ có form hoặc câu hỏi ở trang cha được đóng sau 30s, tab đang tải còn được giữ', async t => {
  const ticks = captureLeadWatcherTicks(t);
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const { session, page, browser, counters } = createLeadTestSession('198.51.100.123');
  session.leadCheckStatus = 'confirmed';
  session.lastActionTime = 0; // phiên "vừa thao tác" (ở tab đầu) không được giữ tab phụ vô nghĩa
  page.currentUrl = 'https://financialhelpfinder.com/thankyou.php';
  const EMPTY = { loading: false, challenge: false, worked: false, hasForm: false, hasChoices: false, empty: false, singleLine: false };
  const popupWith = async (url, result) => {
    const popup = await browser.newPage();
    popup.currentUrl = url;
    popup.evaluate = async fn => fn?.name === 'readSubOfferText' ? 'Some article text\nmore lines' :
      fn?.name === 'detectOfferContentInPage' ? result : null;
    popup.frames = () => [popup];
    return popup;
  };
  const article = await popupWith('https://news.example.com/article', { ...EMPTY, worked: true, hasOfferEntry: true });
  article._uxSweepstakesCardPageUrl = article.currentUrl;
  const form = await popupWith('https://offer.example.com/form', { ...EMPTY, hasForm: true });
  const quiz = await popupWith('https://survey.example.com/q1', { ...EMPTY, hasChoices: true });
  const question = await popupWith('https://survey.example.com/prompt', { ...EMPTY, hasQuestion: true });
  const loading = await popupWith('https://slow.example.com/', { ...EMPTY, loading: true });
  const challenge = await popupWith('https://verify.test/form', EMPTY);
  watchTrafficBlockedPage(session);
  const tickAt = async at => { now = at; ticks[0](); for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve)); };
  await tickAt(0);
  challenge._manualCaptchaPending = true;
  await tickAt(29_000);
  assert.equal(article.closed, false, 'chưa đủ 30s thì chưa đóng');
  // Đọc DOM tab con tối đa mỗi 5 giây (giảm tải 2026-11-16): quyết định đóng có thể trễ thêm tối đa 5 giây sau mốc 30s.
  await tickAt(31_000);
  await tickAt(35_000);
  assert.equal(article.closed, true, 'tab không form/câu hỏi bị đóng');
  assert.equal(form.closed, true);
  assert.equal(quiz.closed, true);
  assert.equal(question.closed, true);
  assert.equal(loading.closed, false);
  assert.equal(challenge.closed, false, 'giữ đúng tab đang xác minh');
  challenge._manualCaptchaPending = false;
  await tickAt(45_000);
  await tickAt(70_000);
  assert.equal(challenge.closed, false, 'đếm lại thời gian trống sau khi xác minh');
  await tickAt(75_000);
  assert.equal(challenge.closed, true);
  assert.equal(page.closed, false, 'tab đầu giữ nguyên');
  assert.equal(counters.browserCloses, 0);
});

test('watcher: một lần reload cùng URL hoặc đọc lỗi sẽ bắt đầu lại thời gian chờ trước khi đóng tab phụ', async t => {
  const ticks = captureLeadWatcherTicks(t);
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const { session, browser } = createLeadTestSession('198.51.100.81');
  session.leadCheckStatus = 'confirmed';
  const popup = await openPopup(browser, 'https://article.test/story', '');
  let unreadable = false;
  popup.evaluate = async fn => {
    if (fn.name !== 'detectOfferContentInPage') return null;
    if (unreadable) throw new Error('Frame detached');
    return { hasForm: false, hasChoices: false, hasQuestion: false };
  };
  watchTrafficBlockedPage(session);
  const checkAt = async time => {
    now = time;
    ticks[0]();
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  };
  await checkAt(0);
  now = 29_000;
  await popup.reload();
  await checkAt(31_000);
  assert.equal(popup.closed, false);
  unreadable = true;
  await checkAt(60_000);
  unreadable = false;
  await checkAt(66_000);
  assert.equal(popup.closed, false);
  await checkAt(91_000);
  assert.equal(popup.closed, false);
  await checkAt(96_000);
  assert.equal(popup.closed, true);
});

test('watcher: không đóng tab vừa được chuyển thành tab chính khi đang đọc DOM', async t => {
  const ticks = captureLeadWatcherTicks(t);
  const { session, browser, counters } = createLeadTestSession('198.51.100.82');
  session.leadCheckStatus = 'confirmed';
  const popup = await openPopup(browser, 'https://article.test/story', '');
  popup.evaluate = async fn => {
    if (fn.name === 'detectOfferContentInPage') return { hasForm: false };
    if (fn.name !== 'readSubOfferText') return null;
    session.mainPage = popup;
    return 'This offer is no longer available.';
  };
  watchTrafficBlockedPage(session);
  ticks[0]();
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(session.mainPage, popup);
  assert.equal(popup.closed, false);
  assert.equal(counters.pageCloses, 0);
});

test('giảm tải: bộ canh chỉ đọc DOM mỗi tab con tối đa mỗi 5 giây; luật theo URL (chrome-error) vẫn đóng ngay', async t => {
  const { watchTrafficBlockedPage } = await import('../src/leads/actions/watch-traffic-blocked-page.mjs');
  const { captureLeadWatcherTicks, createLeadTestSession } = await import('./helpers/lead-session-fixture.mjs');
  const { SUB_OFFER_DOM_CHECK_MS } = await import('../src/leads/actions/watch-traffic-blocked-page.mjs');
  const { autoRefill } = await import('../src/runtime/constants/auto-refill.mjs');
  const previous = { enabled: autoRefill.enabled };
  autoRefill.enabled = false;
  t.after(() => Object.assign(autoRefill, previous));
  const ticks = captureLeadWatcherTicks(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const { session, page, browser } = createLeadTestSession('198.51.100.71');
  page.currentUrl = 'https://offer.test/main';
  page.frames = () => [page];
  const working = await browser.newPage();
  working.currentUrl = 'https://sub.test/survey';
  let domReads = 0;
  working.frames = () => [working];
  // Chỉ đếm hai lệnh đọc DOM nặng đã giãn nhịp (nội dung offer, chữ tab con); kiểm trang lỗi đã giới hạn 3s từ trước.
  working.evaluate = async callback => {
    if (['detectOfferContentInPage', 'readSubOfferText'].includes(callback?.name)) domReads += 1;
    return callback?.name === 'readSubOfferText' ? 'Survey question' : { loading: false, challenge: false, worked: true, hasForm: true, hasChoices: false, hasOfferWork: true };
  };
  const broken = await browser.newPage();
  broken.currentUrl = 'chrome-error://chromewebdata/';
  watchTrafficBlockedPage(session);
  const run = async seconds => {
    for (let i = 0; i < seconds; i++) {
      now += 1000;
      for (const tick of ticks) tick();
      for (let k = 0; k < 30; k++) await new Promise(resolve => setImmediate(resolve));
    }
  };
  await run(1);
  assert.equal(broken.isClosed(), true, 'tab con lỗi mạng: đóng ngay ở nhịp đầu (chỉ xét URL)');
  domReads = 0;
  await run(20);
  assert.equal(SUB_OFFER_DOM_CHECK_MS, 5000);
  assert.ok(domReads <= 5 * 2, `20 giây chỉ đọc DOM nặng của tab con khoảng 4–5 nhịp (mỗi nhịp tối đa 2 lệnh), thực tế ${domReads}`);
  assert.ok(domReads > 0, 'vẫn kiểm tra định kỳ');
  assert.equal(working.isClosed(), false, 'tab con chưa đủ 30 giây chờ iframe');
});

/**
 * Popup trắng có thể tạo bảng nhập trực tiếp trong iframe srcdoc mà không đổi URL trang cha.
 * @param {import('node:test').TestContext} t Context dọn Chromium.
 * @return {Promise<void>} Bản nháp giữ nguyên sau cả thời hạn tab trắng và không có công việc.
 * @throws {Error} Khi app đánh dấu đóng trước khi đọc iframe thật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function verifyDraftInBlankPopup(t) {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  const opener = await context.newPage();
  const opened = context.waitForEvent('page');
  await opener.evaluate(() => { window.open('about:blank'); });
  const popup = await opened;
  await popup.setContent('<main><iframe srcdoc="<main><input value=draft></main>"></iframe></main>');
  assert.equal(popup.url(), 'about:blank');
  const tracker = { key: 'about:blank', since: Date.now() - 60000 };
  assert.equal(await getEmptyOfferPageReason(popup, tracker, { subTab: true }), null);
  assert.equal(await popup.frameLocator('iframe').locator('input').inputValue(), 'draft');
  await popup.setContent('');
  tracker.since = Date.now() - 21000;
  assert.match(await getEmptyOfferPageReason(popup, tracker, { subTab: true }), /about:blank/);
}
test('popup about:blank giữ tài liệu iframe có bản nháp', { skip: !existsSync(chromium.executablePath()) }, verifyDraftInBlankPopup);

/**
 * Quan sát nhiều response HTTP thành công của cùng endpoint sau khi trang đã hết nội dung.
 * @param {import('node:test').TestContext} t Context điều khiển đồng hồ và đóng Chromium.
 * @return {Promise<void>} Heartbeat không liên tục cấp lại 30 giây cho cùng tài liệu.
 * @throws {Error} Khi tab không thể kết thúc sau thời gian chờ dù đã đọc đầy đủ DOM.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function verifyPeriodicRequestsDoNotExtendGrace(t) {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  attachFrameRequestTracking(page);
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<main>Finished</main>' }));
  await page.goto('https://polling.test/content');
  const start = Date.now();
  let now = start;
  t.mock.method(Date, 'now', () => now);
  const tracker = {};
  for (let tick = 0; tick <= 4; tick++) {
    now = start + tick * 10000;
    const finished = page.waitForEvent('requestfinished', request => request.url().includes('/status?'));
    await page.evaluate(tick => fetch('/status?t=' + tick).then(response => response.text()), tick);
    await finished;
    now += 5;
    const reason = await getEmptyOfferPageReason(page, tracker, { subTab: true });
    if (tick < 3) assert.equal(reason, null);
    else assert.match(reason, /hết form/);
  }
}
test('các request polling ngắn không giữ tab đã trống mãi', { skip: !existsSync(chromium.executablePath()) }, verifyPeriodicRequestsDoNotExtendGrace);

/**
 * Giữ request điều hướng chưa được công bố trong popup, sau đó mô phỏng runtime cũ mất terminal event.
 * @return {void} Các tab và tài liệu mới độc lập với request cũ.
 * @throws {Error} Khi một tab/tài liệu vô can bị đánh dấu đang tải.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
function verifyRequestOwnership() {
  const context = new EventEmitter();
  const popup = new EventEmitter();
  const other = new EventEmitter();
  context.pages = () => [popup, other];
  popup.context = other.context = () => context;
  let currentUrl = 'https://document.test/previous';
  const frame = { page: () => popup, url: () => currentUrl };
  attachFrameRequestTracking(context);
  let published = false;
  const initial = {
    frame: () => { if (!published) throw new Error('awaiting page'); return frame; },
    url: () => currentUrl, resourceType: () => 'document', isNavigationRequest: () => true,
  };
  context.emit('request', initial);
  assert.equal(hasPendingFrameRequests(other), false);
  popup.emit('request', initial);
  assert.equal(hasPendingFrameRequests(popup), true);
  published = true;
  assert.equal(hasPendingFrameRequests(popup, frame), true);
  context.emit('requestfinished', initial);
  const oldFetch = { frame: () => frame, url: () => 'https://document.test/slow', resourceType: () => 'fetch' };
  context.emit('request', oldFetch);
  const nextUrl = 'https://document.test/next';
  const navigation = { frame: () => frame, url: () => nextUrl, resourceType: () => 'document', isNavigationRequest: () => true };
  context.emit('request', navigation);
  const newFetch = { ...oldFetch };
  context.emit('request', newFetch);
  currentUrl = nextUrl;
  popup.emit('framenavigated', frame);
  context.emit('requestfinished', navigation);
  assert.equal(hasPendingFrameRequests(popup, frame), true, 'request tài liệu mới vẫn được giữ');
  context.emit('requestfinished', newFetch);
  assert.equal(hasPendingFrameRequests(popup, frame), false, 'request bị hủy ở tài liệu cũ đã nhả');
}
test('popup chưa rõ frame và tài liệu đã thay không khóa các tab khác', verifyRequestOwnership);

/**
 * Kiểm tra tab được thông báo sớm trong khi adapter vẫn chưa trả về danh sách tab ban đầu.
 * @return {Promise<void>} Mọi tab được theo dõi đúng một lần.
 * @throws {Error} Khi listener bị trễ hoặc bị gắn trùng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function verifyAsyncPageListing() {
  const context = new EventEmitter();
  const existingPage = new EventEmitter();
  const popup = new EventEmitter();
  let finishListing;
  context.pages = () => new Promise(resolve => { finishListing = resolve; });
  attachFrameRequestTracking(context);
  context.emit('page', popup);
  assert.equal(popup.listenerCount('request'), 1);
  finishListing([existingPage, popup]);
  await Promise.resolve();
  assert.equal(popup.listenerCount('request'), 1);
  assert.equal(existingPage.listenerCount('request'), 1);
}
test('gắn listener sớm cả khi danh sách tab trả về bất đồng bộ', verifyAsyncPageListing);
