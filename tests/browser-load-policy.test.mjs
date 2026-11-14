import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { captureScreenThumbnail } from '../src/browser/screen/capture-screen-thumbnail.mjs';
import { readThrottledPageHealth } from '../src/leads/page-health/read-throttled-page-health.mjs';
import { handleOfferwallCards } from '../src/autofill/handle-offerwall-cards.mjs';
import { reserveOfferwallTabSlot } from '../src/autofill/reserve-offerwall-tab-slot.mjs';
import { limitOfferTabs } from '../src/browser/tabs/limit-offer-tabs.mjs';
import { warnIdleOfferSession } from '../src/leads/actions/warn-idle-offer-session.mjs';
import { getDeadOrBlockedReason } from '../src/leads/page-health/get-dead-or-blocked-reason.mjs';
import { NON_OFFER_WAIT_MS } from '../src/runtime/constants/non-offer-wait-ms.mjs';

/**
 * Tạo phiên thumbnail giả có quyền kết thúc hoặc làm lỗi lượt chụp để kiểm tra giới hạn tải.
 * @return {object} Phiên, tab và bộ đếm cô lập, không dùng dữ liệu ứng dụng thật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function thumbnailFixture() {
  let finish;
  let fail;
  let captures = 0;
  const page = {
    currentUrl: 'https://offer.test/form', url() { return this.currentUrl; }, isClosed: () => false,
    screenshot: () => { captures++; return new Promise((resolve, reject) => { finish = resolve; fail = reject; }); },
  };
  return {
    session: {}, page, diagnostics: { captures: 0, captureFailures: 0, captureDurationTotalMs: 0, captureDurationMaxMs: 0 },
    finish: () => finish(Buffer.from('image')), fail: () => fail(new Error('capture failed')), captures: () => captures,
  };
}

test('thumbnail: tối đa hai phiên chụp đồng thời, không tích hàng đợi, trả slot sau lỗi', async () => {
  const fixtures = Array.from({ length: 20 }, thumbnailFixture);
  const requests = fixtures.map(f => captureScreenThumbnail(f.session, f.page, f.diagnostics));
  await Promise.resolve();
  assert.equal(fixtures.reduce((sum, f) => sum + f.captures(), 0), 2);
  fixtures[0].finish();
  fixtures[1].fail();
  const results = await Promise.all(requests);
  assert.ok(Buffer.isBuffer(results[0]));
  assert.ok(results.slice(1).every(result => result == null));
  const retry = captureScreenThumbnail(fixtures[2].session, fixtures[2].page, fixtures[2].diagnostics);
  await Promise.resolve();
  fixtures[2].finish();
  assert.ok(Buffer.isBuffer(await retry));
});

test('thumbnail: dùng cache cùng tài liệu; điều hướng trong lúc chụp không trả ảnh cũ', async () => {
  const fixture = thumbnailFixture();
  const { session, page, diagnostics } = fixture;
  const initial = captureScreenThumbnail(session, page, diagnostics);
  await Promise.resolve();
  fixture.finish();
  await initial;
  assert.ok(Buffer.isBuffer(await captureScreenThumbnail(session, page, diagnostics)));
  assert.equal(fixture.captures(), 1);
  page.currentUrl = 'https://offer.test/next';
  const next = captureScreenThumbnail(session, page, diagnostics);
  await Promise.resolve();
  page.currentUrl = 'https://offer.test/third';
  fixture.finish();
  assert.equal(await next, null);
});

test('health: 20 tab qua 10 nhịp chỉ quét DOM 80 lần thay vì 200; URL lỗi vẫn bắt ngay', async () => {
  let evaluations = 0;
  const pages = Array.from({ length: 20 }, () => ({
    currentUrl: 'https://offer.test/form', url() { return this.currentUrl; }, isClosed: () => false,
    frames: () => [], evaluate: async () => { evaluations++; return null; },
  }));
  for (let second = 0; second < 10; second++) await Promise.all(pages.map(page => readThrottledPageHealth(page, second * 1000)));
  assert.equal(evaluations, 80);
  pages[0].currentUrl = 'chrome-error://chromewebdata/';
  assert.match(await readThrottledPageHealth(pages[0], 9100), /Lỗi mạng/);
  assert.equal(evaluations, 80);
  pages[1]._uxHealthRevision = 1;
  await readThrottledPageHealth(pages[1], 9100);
  assert.equal(evaluations, 81);
});

test('health: hai yêu cầu cùng tab dùng chung lượt quét đang chạy', async () => {
  let finish;
  let evaluations = 0;
  const page = { url: () => 'https://offer.test/form', frames: () => [], evaluate: () => {
    evaluations++;
    return new Promise(resolve => { finish = resolve; });
  } };
  const a = readThrottledPageHealth(page, 0);
  const b = readThrottledPageHealth(page, 1000);
  await Promise.resolve();
  finish(null);
  await Promise.all([a, b]);
  assert.equal(evaluations, 1);
});

test('health: renderer treo không bị gửi thêm evaluate sau mỗi lần timeout', async t => {
  let evaluations = 0;
  let finish;
  const timers = [];
  t.mock.method(globalThis, 'setTimeout', callback => { timers.push(callback); return { unref() {} }; });
  t.mock.method(globalThis, 'clearTimeout', () => {});
  const page = {
    url: () => 'https://offer.test/form', frames: () => [],
    evaluate: () => { evaluations++; return new Promise(resolve => { finish = resolve; }); },
  };
  const first = getDeadOrBlockedReason(page);
  await Promise.resolve();
  timers.shift()();
  assert.equal(await first, null);
  assert.equal(await getDeadOrBlockedReason(page), null);
  assert.equal(evaluations, 1);
  finish(null);
  await new Promise(resolve => setImmediate(resolve));
  const retry = getDeadOrBlockedReason(page);
  await Promise.resolve();
  finish('Traffic Blocked!');
  assert.equal(await retry, 'Traffic Blocked!');
  assert.equal(evaluations, 2);
});

test('health: bỏ kết quả lỗi của tài liệu cũ khi trang vừa điều hướng', async () => {
  let finish;
  const page = {
    url: () => 'https://offer.test/form', frames: () => [],
    evaluate: () => new Promise(resolve => { finish = resolve; }),
  };
  const result = readThrottledPageHealth(page, 0);
  await Promise.resolve();
  page._uxHealthRevision = 1;
  finish('Traffic Blocked!');
  assert.equal(await result, null);
});

test('offerwall: mở tối đa 10 tab tổng và tiếp tục offer còn lại khi có chỗ', { skip: !existsSync(chromium.executablePath()) }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => route.fulfill({ body: '<p>Offer con</p>', contentType: 'text/html' }));
    const page = await context.newPage();
    limitOfferTabs(context, { mainPage: page });
    await page.setContent(Array.from({ length: 12 }, (_, i) => `<div class="offerwall-card"><button class="offerwall-btn" onclick="window.open('https://offer.test/${i}')">Offer ${i}</button></div>`).join(''));
    assert.equal(await handleOfferwallCards(page.mainFrame(), page, { maxConcurrentSubOffers: 10 }), 9);
    assert.equal(context.pages().length, 10);
    assert.equal(await page.locator('[data-ux-opened="1"]').count(), 9);
    await context.pages()[1].close();
    assert.equal(await handleOfferwallCards(page.mainFrame(), page), 1);
    assert.equal(context.pages().length, 10);
    assert.equal(await page.locator('[data-ux-opened="1"]').count(), 10);
  } finally { await browser.close(); }
});

test('Chrome mở trực tiếp 12 tab: chỉ giữ 10 tab đầu, tab 11 và 12 bị đóng', { skip: !existsSync(chromium.executablePath()) }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext();
    const logs = [];
    const pages = [];
    limitOfferTabs(context, { addBrowserLog: entry => logs.push(entry) });
    for (let index = 0; index < 12; index++) pages.push(await context.newPage());
    const deadline = Date.now() + 3000;
    while (context.pages().filter(page => !page.isClosed()).length > 10 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(context.pages().filter(page => !page.isClosed()).length, 10);
    assert.ok(pages.slice(0, 10).every(page => !page.isClosed()));
    assert.ok(pages.slice(10).every(page => page.isClosed()));
    assert.equal(logs.filter(entry => entry.type === 'tab_limit_closed').length, 2);
  } finally { await browser.close(); }
});

test('tab trong giới hạn không bị quét/đóng dù không có form; chỉ tab vượt trần bị đóng', async () => {
  const context = new EventEmitter();
  const pages = [];
  const makePage = () => {
    let closed = false;
    const page = { isClosed: () => closed, frames: () => { throw new Error('Không được quét DOM'); }, close: async () => { closed = true; } };
    pages.push(page);
    return page;
  };
  context.pages = () => pages;
  const main = makePage();
  limitOfferTabs(context, {}, 2);
  const second = makePage();
  context.emit('page', second);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(main.isClosed(), false);
  assert.equal(second.isClosed(), false);
  const third = makePage();
  context.emit('page', third);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(third.isClosed(), true);
  assert.equal(pages.filter(page => !page.isClosed()).length, 2);
  assert.equal(context.listenerCount('page'), 1);
});

test('thumbnail UI: bỏ qua ô ngoài viewport và vùng cuộn bị che', { skip: !existsSync(chromium.executablePath()) }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent('<div id="scroll" style="height:100px;overflow:auto"><div id="visible" style="height:100px"></div><div id="clipped" style="height:100px"></div></div><div id="outside" style="position:absolute;top:1000px;height:100px;width:100px"></div>');
    await page.addScriptTag({ content: readFileSync(new URL('../ui/desktop/functions/_is-thumbnail-visible.js', import.meta.url), 'utf8') });
    assert.deepEqual(await page.evaluate(() => ['visible', 'clipped', 'outside'].map(id => _isThumbnailVisible(document.getElementById(id)))), [true, false, false]);
    await page.evaluate(() => { document.getElementById('scroll').scrollTop = 100; });
    assert.deepEqual(await page.evaluate(() => ['visible', 'clipped'].map(id => _isThumbnailVisible(document.getElementById(id)))), [false, true]);
  } finally { await browser.close(); }
});

test('offerwall: hai tab tranh chỗ cuối chỉ một tab được đặt chỗ, trả chỗ có thể gọi lặp', () => {
  const page = { isClosed: () => false };
  const other = { isClosed: () => false };
  const context = { pages: () => [page, other] };
  page.context = other.context = () => context;
  const release = reserveOfferwallTabSlot(page, 2);
  assert.equal(typeof release, 'function');
  assert.equal(reserveOfferwallTabSlot(other, 2), null);
  release();
  release();
  const retry = reserveOfferwallTabSlot(other, 2);
  assert.equal(typeof retry, 'function');
  retry();
});

test('phiên im lâu: chỉ cảnh báo một lần mỗi mốc hoạt động, giữ phiên thủ công/check lead', () => {
  const events = [];
  const session = { addBrowserLog: entry => events.push(entry) };
  const tracker = { startedAt: 0 };
  assert.equal(warnIdleOfferSession(session, tracker, 299_999), false);
  assert.equal(warnIdleOfferSession(session, tracker, 300_000), true);
  assert.equal(warnIdleOfferSession(session, tracker, 600_000), false);
  session.lastActionTime = 600_000;
  assert.equal(warnIdleOfferSession(session, tracker, 899_999), false);
  assert.equal(warnIdleOfferSession(session, tracker, 900_000), true);
  for (const keep of [{ offerMode: 'manual' }, { offerMode: 'skip' }, { keepOpenAfterLeadCheck: true }, { leadCheckStatus: 'checking' }]) {
    assert.equal(warnIdleOfferSession({ ...session, ...keep }, { startedAt: 0 }, 1_000_000), false);
  }
  assert.equal(events.length, 2);
  assert.equal(session.isClosed, undefined);
});
