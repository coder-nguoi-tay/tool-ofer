import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { matchSubOfferCloseReason, readSubOfferCloseReason } from '../src/leads/actions/get-sub-offer-close-reason.mjs';
import { watchTrafficBlockedPage } from '../src/leads/actions/watch-traffic-blocked-page.mjs';
import { createLeadTestSession, captureLeadWatcherTicks } from './helpers/lead-session-fixture.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';

afterEach(() => { activeBrowsers.clear(); autoRefill.enabled = false; });

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
 * Popup giả: URL + chữ trong trang (chỉ trả chữ cho hàm đọc chữ offer phụ, các evaluate khác trả null).
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
  popup.evaluate = async fn => (fn?.name === 'readSubOfferText' ? text : null);
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

// Quy tắc người dùng chốt 2026-11-13: tab thứ 2 trở đi mà không phải offer có form / câu hỏi thì đóng; tab có form/đáp án giữ.
test('watcher: tab phụ không có form/câu hỏi sau 30s bị đóng (kể cả phiên có lead); tab có form/đáp án/đang tải giữ', async t => {
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
    popup.evaluate = async fn => (fn?.name === 'readSubOfferText' ? 'Some article text\nmore lines' : null);
    popup.frames = () => [{ evaluate: async () => result }];
    return popup;
  };
  const article = await popupWith('https://news.example.com/article', EMPTY);
  const form = await popupWith('https://offer.example.com/form', { ...EMPTY, hasForm: true });
  const quiz = await popupWith('https://survey.example.com/q1', { ...EMPTY, hasChoices: true });
  const loading = await popupWith('https://slow.example.com/', { ...EMPTY, loading: true });
  watchTrafficBlockedPage(session);
  const tickAt = async at => { now = at; ticks[0](); for (let i = 0; i < 30; i++) await new Promise(resolve => setImmediate(resolve)); };
  await tickAt(0);
  await tickAt(29_000);
  assert.equal(article.closed, false, 'chưa đủ 30s thì chưa đóng');
  // Đọc DOM tab con tối đa mỗi 5 giây (giảm tải 2026-11-16): quyết định đóng có thể trễ thêm tối đa 5 giây sau mốc 30s.
  await tickAt(31_000);
  await tickAt(35_000);
  assert.equal(article.closed, true, 'tab không form/câu hỏi bị đóng');
  assert.equal(form.closed, false);
  assert.equal(quiz.closed, false);
  assert.equal(loading.closed, false);
  assert.equal(page.closed, false, 'tab đầu giữ nguyên');
  assert.equal(counters.browserCloses, 0);
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
  assert.equal(working.isClosed(), false, 'tab con đang có form không bị đóng');
});
