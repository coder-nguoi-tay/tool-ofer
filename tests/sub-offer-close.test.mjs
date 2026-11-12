import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { matchSubOfferCloseReason } from '../src/leads/actions/get-sub-offer-close-reason.mjs';
import { watchTrafficBlockedPage } from '../src/leads/actions/watch-traffic-blocked-page.mjs';
import { createLeadTestSession, captureLeadWatcherTicks } from './helpers/lead-session-fixture.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';

afterEach(() => { activeBrowsers.clear(); autoRefill.enabled = false; });

test('quy tắc đóng tab offer phụ: hết offer, chờ xác minh email, lifepointspanel', () => {
  assert.match(matchSubOfferCloseReason({ url: 'https://www.searchcactus.com/x', text: 'This offer is no longer available.' }), /no longer available/i);
  assert.match(matchSubOfferCloseReason({ url: 'https://app.example.com/verify', text: 'Please check your email' }), /check your email/i);
  assert.match(matchSubOfferCloseReason({ url: 'https://start.lifepointspanel.com/aff_c?offer_id=1807&aff_id=1610', text: '' }), /lifepointspanel/i);
  assert.match(matchSubOfferCloseReason({ url: 'https://www.lifepointspanel.com/en-us/signup', text: '' }), /lifepointspanel/i);
  assert.equal(matchSubOfferCloseReason({ url: 'https://offer.example.com/form', text: 'Enter your email to continue' }), null);
  assert.equal(matchSubOfferCloseReason({ url: 'https://evil.test/?u=lifepointspanel.com', text: '' }), null);
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
  const live = await openPopup(browser, 'https://account.yougov.com/us-en/join/new/question-2', 'What is your gender?');
  watchTrafficBlockedPage(session);
  ticks[0]();
  for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(lifepoints.closed, true, 'lifepointspanel bị đóng');
  assert.equal(gone.closed, true, 'trang hết offer bị đóng');
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
  await tickAt(31_000);
  assert.equal(article.closed, true, 'tab không form/câu hỏi bị đóng');
  assert.equal(form.closed, false);
  assert.equal(quiz.closed, false);
  assert.equal(loading.closed, false);
  assert.equal(page.closed, false, 'tab đầu giữ nguyên');
  assert.equal(counters.browserCloses, 0);
});
