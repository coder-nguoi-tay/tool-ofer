import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { normalizeOfferUrl } from '../src/browser/tabs/normalize-offer-url.mjs';
import { selectUniqueOfferUrls } from '../src/browser/tabs/select-unique-offer-urls.mjs';
import { reserveOfferLink } from '../src/browser/tabs/reserve-offer-link.mjs';
import { attachUniqueOfferTabs } from '../src/browser/tabs/attach-unique-offer-tabs.mjs';
import { handleOfferwallCards } from '../src/autofill/handle-offerwall-cards.mjs';
import { hasUnfinishedOfferWork } from '../src/leads/actions/has-unfinished-offer-work.mjs';

/**
 * Chờ sự kiện dọn tab trong giới hạn ngắn, không dùng timer dài hoặc website thật.
 * @param {Function} condition Điều kiện trạng thái tab cần đạt.
 * @return {Promise<void>} Hoàn tất khi điều kiện đúng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function waitFor(condition) {
  const deadline = Date.now() + 3000;
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(condition());
}

test('chuẩn hóa link bỏ fragment/sắp query nhưng giữ tham số offer khác nhau', () => {
  assert.equal(normalizeOfferUrl('https://offer.test/path?b=2&a=1#question'), 'https://offer.test/path?a=1&b=2');
  assert.equal(normalizeOfferUrl('about:blank'), '');
  assert.deepEqual(selectUniqueOfferUrls(['https://offer.test/a#1', 'https://offer.test/a#2', 'https://offer.test/b'], ''), ['https://offer.test/a', 'https://offer.test/b']);
  assert.notEqual(normalizeOfferUrl('https://offer.test/?offer=1'), normalizeOfferUrl('https://offer.test/?offer=2'));
});

test('khóa link trước await, lịch sử qua reload và IP/context khác độc lập', () => {
  const context = {};
  const page = { context: () => context, url: () => 'https://offer.test/wall' };
  const finish = reserveOfferLink(page, '/next#one');
  assert.equal(reserveOfferLink(page, '/next#two'), null);
  finish(true);
  assert.equal(reserveOfferLink(page, '/next'), null);
  assert.ok(reserveOfferLink({ ...page, context: () => ({}) }, '/next'));
  const retry = reserveOfferLink(page, '/failed');
  retry(false);
  assert.ok(reserveOfferLink(page, '/failed'));
});

const skip = !existsSync(chromium.executablePath());
test('IP confirmed: tab gốc/popup trùng bị đóng, reload tab giữ lại không bị đóng, không mở lại link đã đóng', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<form><input name="firstname"></form>');
  t.after(() => context.close());
  const logs = [];
  const session = { mainPage: page, leadCheckStatus: 'confirmed', confirmedLeadIp: '192.0.2.1', exitIp: '192.0.2.1', addBrowserLog: entry => logs.push(entry) };
  attachUniqueOfferTabs(context, session);
  const duplicate = await context.newPage();
  duplicate._uxOriginTab = true;
  await duplicate.goto(page.url() + '#another').catch(() => {});
  await waitFor(() => duplicate.isClosed());
  assert.equal(page.isClosed(), false);
  await page.reload();
  assert.equal(page.isClosed(), false);
  const other = await context.newPage();
  await other.goto('https://offer.test/second');
  await other.close();
  const repeated = await context.newPage();
  await repeated.goto('https://offer.test/second').catch(() => {});
  await waitFor(() => repeated.isClosed());
  assert.equal(context.pages().length, 1);
  assert.equal(session.leadCheckStatus, 'confirmed');
  assert.ok(logs.every(entry => entry.type === 'duplicate_tab_closed'));
});

test('giữ tab có câu hỏi khi tab chính cùng URL chỉ là landing trống', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<h1>Landing</h1>');
  t.after(() => context.close());
  const session = { mainPage: page };
  attachUniqueOfferTabs(context, session);
  const working = await context.newPage();
  await working.goto('https://offer.test/question');
  await working.setContent('<form><label>Answer<input name="answer"></label></form>');
  await page.goto(working.url()).catch(() => {});
  await waitFor(() => page.isClosed());
  assert.equal(working.isClosed(), false);
  assert.equal(session.mainPage, working);
});

test('nhận diện offer giữ form iframe, checkbox có nhãn, nút Continue; bỏ control thuộc bước ẩn', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<div hidden><input name="old"></div><div style="opacity:0"><button>Yes</button><button>No</button></div>');
  t.after(() => context.close());
  assert.equal(await hasUnfinishedOfferWork(page), false);
  for (const html of ['<label><input type="checkbox" style="display:none">Yes</label>', '<button disabled>Continue</button>', '<iframe srcdoc="<form><input name=answer></form>"></iframe>']) {
    await page.setContent(html);
    assert.equal(await hasUnfinishedOfferWork(page), true);
  }
  assert.equal(await hasUnfinishedOfferWork({ isClosed: () => false, evaluate: async () => { throw new Error('renderer busy'); } }), true);
});


test('offerwall có hai thẻ cùng link và reload không mở lại offer đã xử lý', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const html = '<div class="offerwall-card"><a class="offerwall-btn" target="_blank" href="https://offer.test/child">Open</a></div><div class="offerwall-card"><a class="offerwall-btn" target="_blank" href="https://offer.test/child#same">Open</a></div>';
  const { context, page } = await createFormScopeFixture(browser, html);
  t.after(() => context.close());
  attachUniqueOfferTabs(context, { mainPage: page });
  assert.equal(await handleOfferwallCards(page.mainFrame(), page), 1);
  assert.equal(context.pages().length, 2);
  await page.reload();
  assert.equal(await handleOfferwallCards(page.mainFrame(), page), 0);
  assert.equal(context.pages().length, 2);
  assert.equal(await page.locator('[data-ux-opened="1"]').count(), 2);
});


test('hai link khác nhau trong cùng form offerwall đều được mở đúng một lần', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<form><div class="offerwall-card"><a class="offerwall-btn" target="_blank" href="https://offer.test/one">One</a></div><div class="offerwall-card"><a class="offerwall-btn" target="_blank" href="https://offer.test/two">Two</a></div></form>');
  t.after(() => context.close());
  attachUniqueOfferTabs(context, { mainPage: page });
  assert.equal(await handleOfferwallCards(page.mainFrame(), page), 2);
  assert.equal(context.pages().length, 3);
  assert.equal(await handleOfferwallCards(page.mainFrame(), page), 0);
});
