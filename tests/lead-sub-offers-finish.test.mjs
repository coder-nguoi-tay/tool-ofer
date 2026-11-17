import test from 'node:test';
import assert from 'node:assert/strict';
import { finishLeadSessionAfterSubOffers, SUB_OFFER_MIN_LIFETIME_MS, LEAD_FINISH_STABLE_MS } from '../src/leads/actions/finish-lead-session-after-sub-offers.mjs';
import { countPendingAddeptOffers } from '../src/autofill/offerwall/count-pending-addept-offers.mjs';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { stopAbandonedGoLoginLaunch } from '../src/browser/gologin/stop-abandoned-launch.mjs';

/**
 * Tab giả.
 * @return {object} Tab.
 */
function tab(url) {
  const page = { closed: false, isClosed: () => page.closed, url: () => url, close: async () => { page.closed = true; } };
  return page;
}

/**
 * Phiên có lead với tab chính và tab offer con; closeSession ghi nhận việc đóng trình duyệt.
 * @return {object} Phiên, tab và bộ đếm.
 */
function leadSession({ lead = true, subs = 1 } = {}) {
  const main = tab('https://offer.test/path1d.php');
  const subTabs = Array.from({ length: subs }, (_, index) => tab(`https://sub.test/${index}`));
  const all = [main, ...subTabs];
  const context = { pages: () => all.filter(page => !page.closed) };
  main.context = () => context;
  const logs = [], closes = [];
  const session = { browser: context, mainPage: main, exitIp: '198.51.100.50', addBrowserLog: entry => logs.push(entry) };
  if (lead) Object.assign(session, { confirmedLeadIp: '198.51.100.50', leadCheckStatus: 'confirmed', leadHistoryBaselineAt: 0 });
  const closeSession = async options => { closes.push(options); session.isClosed = true; };
  return { session, main, subTabs, all, logs, closes, closeSession };
}
const deps = { hasPendingOpenings: () => false, readPendingWork: async () => false };

test('phiên có lead: offer con làm xong và đóng hết thì đóng trình duyệt sau thời gian ổn định', async () => {
  const { session, subTabs, logs, closes, closeSession } = leadSession();
  await finishLeadSessionAfterSubOffers(session, closeSession, 0, deps);
  await finishLeadSessionAfterSubOffers(session, closeSession, SUB_OFFER_MIN_LIFETIME_MS, deps);
  assert.equal(closes.length, 0, 'tab con còn mở');
  subTabs[0].closed = true;
  assert.equal(await finishLeadSessionAfterSubOffers(session, closeSession, SUB_OFFER_MIN_LIFETIME_MS + 1000, deps), false);
  assert.equal(await finishLeadSessionAfterSubOffers(session, closeSession, SUB_OFFER_MIN_LIFETIME_MS + 1000 + LEAD_FINISH_STABLE_MS, deps), true);
  assert.equal(closes.length, 1);
  assert.equal(closes[0].completedFinancialFlow, true, 'đóng cả IP có lead để lấy slot mới');
  assert.ok(logs.some(entry => entry.type === 'lead_sub_offers_finished' && entry.detail.includes('https://offer.test/path1d.php')), 'log ghi URL trang chính');
});

test('chưa từng có offer con, hoặc offer con chỉ chớp mở rồi đóng ngay (bị chặn/trùng) thì không đóng trình duyệt', async () => {
  const none = leadSession({ subs: 0 });
  for (let now = 0; now <= 60_000; now += 1000) await finishLeadSessionAfterSubOffers(none.session, none.closeSession, now, deps);
  assert.equal(none.closes.length, 0, 'chưa có offer con nào');
  const flash = leadSession();
  await finishLeadSessionAfterSubOffers(flash.session, flash.closeSession, 0, deps);
  flash.subTabs[0].closed = true;
  for (let now = 1000; now <= 60_000; now += 1000) await finishLeadSessionAfterSubOffers(flash.session, flash.closeSession, now, deps);
  assert.equal(flash.closes.length, 0, 'tab con sống chưa tới 10 giây không tính là offer con đã làm');
});

test('phiên không lead, dừng-sau-lead, còn đang mở tab offer, AI giữ tab, đang kiểm lead hoặc màn card sweepstakes: không đóng ở đây', async () => {
  const cases = [
    ['không lead', () => leadSession({ lead: false }), () => {}],
    ['dừng autofill sau lead', leadSession, ctx => Object.assign(ctx.session, { stopAutofillOnLead: true, enableLeadCheck: true })],
    ['đang giữ chỗ mở tab offer', leadSession, ctx => { ctx.deps = { hasPendingOpenings: () => true }; }],
    ['AI giữ tab chính', leadSession, ctx => { ctx.main._aiAssistRunning = true; }],
    ['lượt kiểm lead đang chạy', leadSession, ctx => { ctx.session.leadCheckRunning = true; }],
    ['màn card sweepstakes (bộ khác xử lý)', leadSession, ctx => { ctx.main._uxOriginTab = true; ctx.main._uxSweepstakesCardPageUrl = ctx.main.url(); }],
  ];
  for (const [name, make, setup] of cases) {
    const ctx = make();
    ctx.deps = deps;
    setup(ctx);
    await finishLeadSessionAfterSubOffers(ctx.session, ctx.closeSession, 0, ctx.deps);
    await finishLeadSessionAfterSubOffers(ctx.session, ctx.closeSession, SUB_OFFER_MIN_LIFETIME_MS, ctx.deps);
    ctx.subTabs[0].closed = true;
    for (let now = SUB_OFFER_MIN_LIFETIME_MS + 1000; now <= 2 * 60_000; now += 1000) await finishLeadSessionAfterSubOffers(ctx.session, ctx.closeSession, now, ctx.deps);
    assert.equal(ctx.closes.length, 0, name);
  }
});

test('không ném lỗi ra bộ canh phiên', async () => {
  assert.equal(await finishLeadSessionAfterSubOffers({ confirmedLeadIp: '198.51.100.1', exitIp: '198.51.100.1', leadHistoryBaselineAt: 0, browser: { pages: () => { throw new Error('CDP'); } } }, async () => {}, 0), false);
  assert.equal(await finishLeadSessionAfterSubOffers(null, async () => {}, 0), false);
});

test('bỏ slot mở quá hạn: dừng Orbita của lượt mở đó (không để mồ côi); chưa kết nối thì không có gì để dừng', async () => {
  let stops = 0;
  const logs = [];
  const attempt = { abandoned: true, startupSession: { _stopProfile: async () => { stops += 1; }, addBrowserLog: entry => logs.push(entry) } };
  assert.equal(await stopAbandonedGoLoginLaunch(attempt), true);
  assert.equal(stops, 1);
  assert.ok(logs.some(entry => entry.type === 'slot_launch_abandoned_stop'));
  assert.equal(await stopAbandonedGoLoginLaunch(attempt), false, 'gọi lại không dừng lần hai');
  assert.equal(stops, 1);
  assert.equal(await stopAbandonedGoLoginLaunch({ abandoned: true, startupSession: { addBrowserLog() {} } }), false, 'chưa có Orbita');
  assert.equal(await stopAbandonedGoLoginLaunch({ abandoned: true, startupSession: { _stopProfile: async () => { throw new Error('stop fail'); }, addBrowserLog() {} } }), false, 'lỗi dừng không ném ra ngoài');
});

test('tích hợp: bộ canh phiên thật đóng trình duyệt của IP có lead khi offer con đã đóng hết', async t => {
  const { watchTrafficBlockedPage } = await import('../src/leads/actions/watch-traffic-blocked-page.mjs');
  const { captureLeadWatcherTicks, createLeadTestSession } = await import('./helpers/lead-session-fixture.mjs');
  const { recordLeadIpStats, leadIpStatsMap } = await import('../lead-check.mjs');
  const { autoRefill } = await import('../src/runtime/constants/auto-refill.mjs');
  const previous = { enabled: autoRefill.enabled, stopRequested: autoRefill.stopRequested };
  autoRefill.enabled = false;
  t.after(() => { Object.assign(autoRefill, previous); leadIpStatsMap.clear(); });
  const ticks = captureLeadWatcherTicks(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const ip = '198.51.100.61';
  const { session, page, counters, browser } = createLeadTestSession(ip);
  page.currentUrl = 'https://offer.test/path1d.php';
  page.frames = () => [page];
  // Trang chính đã hết việc (detectOfferContentInPage không thấy form/câu hỏi/offer).
  page.evaluate = async callback => callback?.name === 'detectOfferContentInPage' ? { loading: false, challenge: false, hasForm: false, hasChoices: false, hasFormProgress: false, hasOfferEntry: false, hasOfferWork: false } : 0;
  recordLeadIpStats({ ip });
  const sub = await browser.newPage();
  sub.currentUrl = 'https://sub-offer.test/join';
  const logs = [];
  session.addBrowserLog = entry => logs.push(entry);
  watchTrafficBlockedPage(session);
  const run = async seconds => {
    for (let i = 0; i < seconds; i++) {
      now += 1000;
      for (const tick of ticks) tick();
      for (let k = 0; k < 30; k++) await new Promise(resolve => setImmediate(resolve));
    }
  };
  await run(15);
  assert.equal(counters.browserCloses, 0, 'offer con còn mở: giữ trình duyệt');
  await sub.close();
  await run(25);
  assert.ok(logs.some(entry => entry.type === 'lead_sub_offers_finished'), `log: ${logs.map(entry => entry.type).join(', ')}`);
  assert.equal(counters.browserCloses, 1, 'hết offer con: đóng trình duyệt để lấy slot mới');
});

test('trang cuối còn offer chưa bấm (hoặc còn form/câu hỏi): không đóng dù không còn tab con', async () => {
  const { session, subTabs, closes, closeSession } = leadSession();
  let pendingWork = true;
  const settings = { hasPendingOpenings: () => false, readPendingWork: async () => pendingWork };
  await finishLeadSessionAfterSubOffers(session, closeSession, 0, settings);
  await finishLeadSessionAfterSubOffers(session, closeSession, SUB_OFFER_MIN_LIFETIME_MS, settings);
  subTabs[0].closed = true; // offer con trước đó đã xong; trang chính vừa tới trang cuối, chưa kịp bấm offer nào
  for (let now = SUB_OFFER_MIN_LIFETIME_MS + 1000; now <= 5 * 60_000; now += 1000) await finishLeadSessionAfterSubOffers(session, closeSession, now, settings);
  assert.equal(closes.length, 0, 'trang cuối còn offer chưa bấm: giữ trình duyệt');
  pendingWork = false; // đã mở hết offer và các tab con đã xong
  const start = 5 * 60_000 + 1000;
  assert.equal(await finishLeadSessionAfterSubOffers(session, closeSession, start, settings), false);
  assert.equal(await finishLeadSessionAfterSubOffers(session, closeSession, start + LEAD_FINISH_STABLE_MS - 1000, settings), false);
  assert.equal(await finishLeadSessionAfterSubOffers(session, closeSession, start + LEAD_FINISH_STABLE_MS, settings), true);
  assert.equal(LEAD_FINISH_STABLE_MS, 15_000, 'chờ 15 giây để autofill kịp bấm offer đầu tiên ở trang mới');
});

test('trang chính vừa đổi URL thì tính lại thời gian chờ, không đóng ngay khi vừa tới trang mới', async () => {
  const { session, main, subTabs, closes, closeSession } = leadSession();
  await finishLeadSessionAfterSubOffers(session, closeSession, 0, deps);
  await finishLeadSessionAfterSubOffers(session, closeSession, SUB_OFFER_MIN_LIFETIME_MS, deps);
  subTabs[0].closed = true;
  const base = SUB_OFFER_MIN_LIFETIME_MS + 1000;
  await finishLeadSessionAfterSubOffers(session, closeSession, base, deps);
  main.url = () => 'https://blissxo.com/125k-ow?game=lose';
  assert.equal(await finishLeadSessionAfterSubOffers(session, closeSession, base + LEAD_FINISH_STABLE_MS, deps), false, 'URL vừa đổi: đếm lại');
  assert.equal(await finishLeadSessionAfterSubOffers(session, closeSession, base + 2 * LEAD_FINISH_STABLE_MS, deps), true);
  assert.equal(closes.length, 1);
});

test('Chromium: đếm offer Addept chưa bấm trong mọi iframe offerwall của trang', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  const wall = '<div class="unit-stack">' + [0, 1, 2].map(index => `<div class="unit-card" data-index="${index}"><div class="unit-actions"><button class="unit-button">Claim Offer</button></div></div>`).join('') + '<div class="unit-card" hidden><button class="unit-button">Hidden</button></div></div>';
  await context.route('**/*', route => {
    const url = route.request().url();
    const body = url.includes('sdk.scrptk.com') ? wall : url.includes('no-wall') ? '<h1>Không có offerwall</h1>' : '<h1>Final</h1><iframe src="https://sdk.scrptk.com/content/render?x=1" style="width:100%;height:600px"></iframe>';
    return route.fulfill({ contentType: 'text/html', body });
  });
  const page = await context.newPage();
  await page.goto('https://blissxo.com/125k-ow?game=lose');
  const frame = page.frames().find(item => item.url().includes('sdk.scrptk.com'));
  await frame.waitForSelector('.unit-card');
  assert.equal(await countPendingAddeptOffers(page), 3, 'ba thẻ hiện chưa bấm (bỏ thẻ ẩn)');
  await frame.evaluate(() => document.querySelectorAll('.unit-card')[0].setAttribute('data-ux-ow-clicked', '1'));
  assert.equal(await countPendingAddeptOffers(page), 2);
  await frame.evaluate(() => document.querySelectorAll('.unit-card').forEach(card => card.setAttribute('data-ux-ow-clicked', '1')));
  assert.equal(await countPendingAddeptOffers(page), 0);
  const plain = await context.newPage();
  await plain.goto('https://offer.test/no-wall');
  assert.equal(await countPendingAddeptOffers(plain), 0, 'trang không có offerwall');
});

test('tích hợp: phiên lead offer 2615 không bị luật chung (lead + hết offer con, thankyou chung) đóng; chỉ thankyou.php của FinancialHelpFinder', async t => {
  const { watchTrafficBlockedPage } = await import('../src/leads/actions/watch-traffic-blocked-page.mjs');
  const { captureLeadWatcherTicks, createLeadTestSession } = await import('./helpers/lead-session-fixture.mjs');
  const { recordLeadIpStats, leadIpStatsMap } = await import('../lead-check.mjs');
  const { autoRefill } = await import('../src/runtime/constants/auto-refill.mjs');
  const previous = { enabled: autoRefill.enabled, stopRequested: autoRefill.stopRequested };
  autoRefill.enabled = false;
  t.after(() => { Object.assign(autoRefill, previous); leadIpStatsMap.clear(); });
  const ticks = captureLeadWatcherTicks(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const ip = '198.51.100.62';
  const { session, page, counters, browser } = createLeadTestSession(ip);
  session.websiteUrl = 'https://toffers.top/click/?key=1&offer_id=2615&aff_id=x';
  page.currentUrl = 'https://blog.financialhelpfinder.com/path1d.php';
  page.frames = () => [page];
  page.evaluate = async callback => callback?.name === 'detectOfferContentInPage' ? { loading: false, challenge: false, hasForm: false, hasChoices: false, hasFormProgress: false, hasOfferEntry: false, hasOfferWork: false } : 0;
  recordLeadIpStats({ ip });
  // Popup rác (searchcactus) sống quá 10 giây rồi đóng: trước đây được tính là "offer con đã làm" và đóng cả phiên.
  const popup = await browser.newPage();
  popup.currentUrl = 'https://www.searchcactus.com/publisher/landing';
  const logs = [];
  session.addBrowserLog = entry => logs.push(entry);
  watchTrafficBlockedPage(session);
  const run = async seconds => {
    for (let i = 0; i < seconds; i++) {
      now += 1000;
      for (const tick of ticks) tick();
      for (let k = 0; k < 30; k++) await new Promise(resolve => setImmediate(resolve));
    }
  };
  await run(15);
  await popup.close();
  await run(40);
  assert.ok(!logs.some(entry => entry.type === 'lead_sub_offers_finished'), `log: ${logs.map(entry => entry.type).join(', ')}`);
  assert.equal(counters.browserCloses, 0, 'phiên lead 2615 chưa tới thankyou.php: giữ trình duyệt');
});
