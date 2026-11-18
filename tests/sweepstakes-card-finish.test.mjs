import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { finishSweepstakesCardSession, countPendingSweepstakesCards, SUB_TAB_MAX_MS, FINISH_STABLE_MS } from '../src/autofill/offerwall/finish-sweepstakes-card-session.mjs';
import { handleSweepstakesCardPage } from '../src/autofill/offerwall/handle-sweepstakes-card-page.mjs';

/**
 * Tab giả; `root` là màn card sweepstakes đã được handler nhận (tab gốc).
 * @return {object} Tab giả.
 */
function fakeTab(url, root = false) {
  const tab = { closed: false, isClosed: () => tab.closed, url: () => url, close: async () => { tab.closed = true; } };
  if (root) Object.assign(tab, { _uxOriginTab: true, _uxSweepstakesCardPageUrl: url });
  return tab;
}

/**
 * Phiên giả gồm tab gốc và các tab con; closeSession ghi nhận lần đóng trình duyệt.
 * @return {object} Phiên, tab và bộ đếm.
 */
function fakeSession(subCount = 2) {
  const root = fakeTab('https://sweepstakesalerts.com/wall', true);
  const subs = Array.from({ length: subCount }, (_, index) => fakeTab(`https://offer.test/${index}`));
  const tabs = [root, ...subs];
  const context = { pages: () => tabs.filter(tab => !tab.closed) };
  root.context = () => context;
  const logs = [], closes = [];
  const session = { browser: context, mainPage: root, addBrowserLog: entry => logs.push(entry) };
  const closeSession = async options => { closes.push(options); session.isClosed = true; };
  return { session, root, subs, logs, closes, closeSession };
}

const noPending = { readPending: async () => 0, persistOutcome: async () => {} };

test('tab con mở đủ 5 phút thì bị đóng; chưa đủ thì giữ; tab gốc màn card không bao giờ bị đóng ở đây', async () => {
  const { session, root, subs, logs, closeSession } = fakeSession(2);
  await finishSweepstakesCardSession(session, closeSession, 0, noPending);
  await finishSweepstakesCardSession(session, closeSession, SUB_TAB_MAX_MS - 1000, noPending);
  assert.ok(subs.every(tab => !tab.closed), 'chưa đủ 5 phút');
  await finishSweepstakesCardSession(session, closeSession, SUB_TAB_MAX_MS, noPending);
  assert.ok(subs.every(tab => tab.closed), 'đủ 5 phút: đóng tab con');
  assert.equal(root.closed, false);
  assert.equal(logs.filter(entry => entry.type === 'sweepstakes_sub_tab_timeout').length, 2);
  assert.equal(SUB_TAB_MAX_MS, 300_000);
});

test('tab con mở sau tính giờ riêng: mỗi tab đủ 5 phút kể từ lúc nó xuất hiện', async () => {
  const { session, subs, closeSession } = fakeSession(1);
  await finishSweepstakesCardSession(session, closeSession, 0, noPending);
  const late = fakeTab('https://offer.test/late');
  const tabs = session.browser.pages();
  session.browser.pages = () => [...tabs, late].filter(tab => !tab.closed);
  await finishSweepstakesCardSession(session, closeSession, 2 * 60_000, noPending);
  await finishSweepstakesCardSession(session, closeSession, SUB_TAB_MAX_MS, noPending);
  assert.equal(subs[0].closed, true);
  assert.equal(late.closed, false, 'tab mở sau mới được 3 phút');
  await finishSweepstakesCardSession(session, closeSession, 2 * 60_000 + SUB_TAB_MAX_MS, noPending);
  assert.equal(late.closed, true);
});

test('hết tab con và hết thẻ chưa mở, ổn định 5 giây thì đóng trình duyệt để nhường slot', async () => {
  const { session, logs, closes, closeSession } = fakeSession(1);
  await finishSweepstakesCardSession(session, closeSession, 0, noPending);
  await finishSweepstakesCardSession(session, closeSession, SUB_TAB_MAX_MS, noPending);
  assert.equal(closes.length, 0, 'vừa đóng tab con: chưa đóng trình duyệt ngay');
  assert.equal(await finishSweepstakesCardSession(session, closeSession, SUB_TAB_MAX_MS + FINISH_STABLE_MS - 1000, noPending), false);
  assert.equal(await finishSweepstakesCardSession(session, closeSession, SUB_TAB_MAX_MS + FINISH_STABLE_MS, noPending), true);
  assert.equal(closes.length, 1);
  assert.equal(closes[0].completedFinancialFlow, true, 'đóng như phiên hoàn tất (cả IP có lead)');
  assert.ok(logs.some(entry => entry.type === 'sweepstakes_completed'));
});

test('còn thẻ chưa mở, đang giữ chỗ mở tab, hoặc chưa tới màn card thì không đóng trình duyệt', async () => {
  for (const [name, setup] of [
    ['còn thẻ chưa mở', ctx => ({ ...noPending, readPending: async () => 2 })],
    ['không đọc được màn card', ctx => ({ ...noPending, readPending: async () => null })],
    ['đang mở tab offer', ctx => ({ ...noPending, hasPendingOpenings: () => true })],
    ['chưa phải màn card', ctx => { ctx.root._uxSweepstakesCardPageUrl = null; return noPending; }],
    ['đang kiểm lead', ctx => { ctx.session.leadCheckStatus = 'checking'; return noPending; }],
    ['AI đang giữ tab', ctx => { ctx.root._aiAssistRunning = true; return noPending; }],
  ]) {
    const ctx = fakeSession(0);
    const settings = setup(ctx);
    for (let now = 0; now <= 60_000; now += 1000) await finishSweepstakesCardSession(ctx.session, ctx.closeSession, now, settings);
    assert.equal(ctx.closes.length, 0, name);
  }
});

test('bật dừng autofill sau lead và phiên đã có lead: giữ nguyên trình duyệt và tab con', async () => {
  const { session, subs, closes, closeSession } = fakeSession(1);
  Object.assign(session, { stopAutofillOnLead: true, enableLeadCheck: true, exitIp: '198.51.100.4', confirmedLeadIp: '198.51.100.4', leadHistoryBaselineAt: 0 });
  for (let now = 0; now <= 2 * SUB_TAB_MAX_MS; now += 30_000) await finishSweepstakesCardSession(session, closeSession, now, noPending);
  assert.equal(subs[0].closed, false);
  assert.equal(closes.length, 0);
});

test('Chromium: màn card thật — đếm thẻ chưa mở, mở hết, tab con quá 5 phút bị đóng rồi đóng trình duyệt', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  const html = `<html style="--progressPercentage:99%"><body><main><div class="offerwall-card-wrap">
    <div class="card"><a target="_blank" href="https://offer.test/one">One</a></div>
    <div class="card"><a target="_blank" href="https://offer.test/two">Two</a></div>
    <div class="card" hidden><a target="_blank" href="https://offer.test/hidden">Hidden</a></div>
    <div class="card"><a href="#top">Hash only</a></div></div></main></body></html>`;
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/wall') ? html : '<p>offer</p>' }));
  const root = await context.newPage();
  await root.goto('https://sweepstakesalerts.com/wall');
  const logs = [], closes = [];
  const session = { browser: context, mainPage: root, enableLeadCheck: false, addBrowserLog: entry => logs.push(entry) };
  assert.equal(await countPendingSweepstakesCards(root), 2, 'hai thẻ có link thật chưa mở (bỏ thẻ ẩn, link #, và khung bọc ngoài)');
  await handleSweepstakesCardPage(root, session, { autoSubmit: true });
  assert.equal(await countPendingSweepstakesCards(root), 0, 'đã mở hết thẻ');
  assert.equal(context.pages().length, 3);
  const closeSession = async options => { closes.push(options); session.isClosed = true; };
  const settings = { persistOutcome: async () => {} };
  await finishSweepstakesCardSession(session, closeSession, 0, settings);
  assert.equal(closes.length, 0, 'tab con còn mở');
  await finishSweepstakesCardSession(session, closeSession, SUB_TAB_MAX_MS, settings);
  assert.equal(context.pages().length, 1, 'tab con quá 5 phút bị đóng, còn tab gốc');
  await finishSweepstakesCardSession(session, closeSession, SUB_TAB_MAX_MS + 1000, settings);
  await finishSweepstakesCardSession(session, closeSession, SUB_TAB_MAX_MS + 1000 + FINISH_STABLE_MS, settings);
  assert.equal(closes.length, 1, 'hết tab con: đóng trình duyệt');
  assert.equal(root.isClosed(), false, 'việc đóng thật do closeSessionAndRefill làm');
});

test('tích hợp: bộ canh phiên thật (watchTrafficBlockedPage) đóng tab con sau 5 phút rồi đóng trình duyệt', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { watchTrafficBlockedPage } = await import('../src/leads/actions/watch-traffic-blocked-page.mjs');
  const { autoRefill } = await import('../src/runtime/constants/auto-refill.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  const html = '<html style="--progressPercentage:99%"><body><main><div class="offerwall-card-wrap"><div class="card"><a target="_blank" href="https://offer.test/one">One</a></div><div class="card"><a target="_blank" href="https://offer.test/two">Two</a></div></div></main></body></html>';
  // Tab con còn form để làm: chỉ quy tắc 5 phút mới được đóng nó (không phải quy tắc "trang trống").
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('/wall') ? html : '<main style="text-align:center"><form><h3>Your email?</h3><input name="email"><button type="submit">Continue</button></form></main>' }));
  const root = await context.newPage();
  await root.goto('https://sweepstakesalerts.com/wall');
  const logs = [];
  let browserClosed = false;
  const session = { browser: context, mainPage: root, enableLeadCheck: false, exitIp: '198.51.100.30', slot: 1, addBrowserLog: entry => logs.push(entry) };
  await handleSweepstakesCardPage(root, session, { autoSubmit: true });
  assert.equal(context.pages().length, 3);
  const previous = { enabled: autoRefill.enabled, stopRequested: autoRefill.stopRequested };
  autoRefill.enabled = false;
  t.after(() => Object.assign(autoRefill, previous));
  context.close = async () => { browserClosed = true; };
  let offset = 0;
  const realNow = Date.now.bind(Date);
  t.mock.method(Date, 'now', () => realNow() + offset);
  const ticker = setInterval(() => { offset += 20_000; }, 200);
  t.after(() => clearInterval(ticker));
  watchTrafficBlockedPage(session);
  const deadline = realNow() + 30_000;
  while (realNow() < deadline && !browserClosed) await new Promise(resolve => setTimeout(resolve, 200));
  session.isClosed = true;
  const types = logs.map(entry => entry.type);
  assert.equal(types.filter(type => type === 'sweepstakes_sub_tab_timeout').length, 2, `log: ${types.join(', ')}`);
  assert.ok(types.includes('sweepstakes_completed'), `log: ${types.join(', ')}`);
  assert.equal(browserClosed, true, 'trình duyệt được đóng để nhường slot');
});

test('không ném lỗi ra bộ canh phiên dù browser.pages() trả Promise hoặc ném lỗi', async () => {
  const asyncPages = { browser: { pages: async () => [] } };
  assert.equal(await finishSweepstakesCardSession(asyncPages, async () => {}, 0), false);
  const throwing = { browser: { pages: () => { throw new Error('CDP mất kết nối'); } } };
  assert.equal(await finishSweepstakesCardSession(throwing, async () => {}, 0), false);
});
