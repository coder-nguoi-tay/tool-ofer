import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { isExcludedOfferPageUrl } from '../src/browser/tabs/is-excluded-offer-page-url.mjs';
import { attachUniqueOfferTabs } from '../src/browser/tabs/attach-unique-offer-tabs.mjs';
import { normalizeOfferUrl } from '../src/browser/tabs/normalize-offer-url.mjs';
import { handleOfferwallCards } from '../src/autofill/handle-offerwall-cards.mjs';
import { installExcludedPopupFilter } from '../src/browser/tabs/install-excluded-popup-filter.mjs';
import { readVisiblePageState } from '../src/ai-assist/visible-state/read-visible-page-state.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { hasUnfinishedOfferWork } from '../src/leads/actions/has-unfinished-offer-work.mjs';
import { humanClick } from '../src/autofill/human-click.mjs';

const blocked = [
  'https://contact.uplevelrewards.com/policies/page/about_our_program',
  'https://contact.uplevelrewards.com/policies/page/rzu_program_requirements_',
  'https://contact.uplevelrewards.com/policies/page/rzu_program_requirements_?utm_source=footer-default-40991',
  'https://contact.uplevelrewards.com/policies/page/about_our_program?utm_source=footer-default-40991',
  'https://contact.flashrewards.co/policies/page/rzu_program_requirements_?utm_source=footer-survey',
  'https://secure.usgoldbureau.com/affiliate/affiliate-ira-default/?utm_source=affiliate&_ef_transaction_id=sample&oid=17',
];

/**
 * Chờ sự kiện đóng tab không phụ thuộc timer dài hoặc website ngoài.
 * @param {Function} condition Điều kiện tab cần đạt.
 * @return {Promise<void>} Hoàn tất khi điều kiện đúng, ném assertion khi quá hạn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function waitFor(condition) {
  const deadline = Date.now() + 3000;
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(condition());
}

test('loại trừ đúng host/path, không phụ thuộc tracking và không đóng nhầm offer khác', () => {
  for (const url of blocked) assert.equal(isExcludedOfferPageUrl(url), true);
  for (const url of ['https://contact.uplevelrewards.com.evil.test/policies/page/about_our_program', 'https://secure.usgoldbureau.com/affiliate/another-offer/', 'https://offer.test/?next=https://contact.uplevelrewards.com/policies/page/about_our_program']) assert.equal(isExcludedOfferPageUrl(url), false);
  assert.equal(normalizeOfferUrl('https://offer.test/?offer=1&utm_source=first#step'), normalizeOfferUrl('https://offer.test/?utm_source=second&offer=1'));
  assert.notEqual(normalizeOfferUrl('https://offer.test/?offer=1'), normalizeOfferUrl('https://offer.test/?offer=2'));
});

test('mouse.down lỗi sau khi bắt đầu input không chạy thêm click fallback', async () => {
  let presses = 0, releases = 0, fallbackClicks = 0;
  const page = { evaluate: async () => {}, mouse: { move: async () => {}, down: async () => { presses++; throw new Error('CDP disconnected'); }, up: async () => { releases++; } } };
  const target = { evaluate: async () => ({ ready: true }), boundingBox: async () => ({ x: 10, y: 10, width: 50, height: 30 }), click: async () => { fallbackClicks++; } };
  assert.equal(await humanClick(page, target), false);
  assert.equal(presses, 1);
  assert.equal(releases, 1);
  assert.equal(fallbackClicks, 0);
});

const skip = !existsSync(chromium.executablePath());
test('tab policy/gold bị đóng trên IP confirmed, giữ tab câu hỏi', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<form><input name="answer"></form>');
  t.after(() => context.close());
  const session = { mainPage: page, exitIp: '192.0.2.77', confirmedLeadIp: '192.0.2.77', leadCheckStatus: 'confirmed' };
  attachUniqueOfferTabs(context, session);
  for (const url of blocked) {
    const popup = await context.newPage();
    await popup.goto(url).catch(() => {});
    await waitFor(() => popup.isClosed());
    assert.equal(page.isClosed(), false);
  }
  assert.equal(session.leadCheckStatus, 'confirmed');
});

test('policy là tab cuối của IP có lead: đóng policy, giữ browser bằng tab trống', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<form><input></form>');
  t.after(() => context.close());
  const session = { mainPage: page, exitIp: '192.0.2.78', confirmedLeadIp: '192.0.2.78', leadCheckStatus: 'confirmed' };
  attachUniqueOfferTabs(context, session);
  await page.goto(blocked[0]).catch(() => {});
  await waitFor(() => page.isClosed());
  assert.equal(context.pages().length, 1);
  assert.equal(context.pages()[0].url(), 'about:blank');
  assert.equal(session.mainPage, context.pages()[0]);
});

test('offer chỉ có button, footer policy không bị lấy làm đích; DOM dựng lại và quét đồng thời chỉ click một lần', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const html = `<div class="offerwall-card" data-offer-id="offer-42"><h3>Offer forty two</h3><button class="offerwall-btn" type="button" onclick="window.offerClicks=(window.offerClicks||0)+1">Claim</button><a target="_blank" href="${blocked[0]}">About our program</a></div>`;
  const { context, page } = await createFormScopeFixture(browser, html);
  t.after(() => context.close());
  attachUniqueOfferTabs(context, { mainPage: page });
  const runs = await Promise.all([handleOfferwallCards(page.mainFrame(), page), handleOfferwallCards(page.mainFrame(), page)]);
  assert.equal(runs.reduce((sum, count) => sum + count, 0), 1);
  assert.equal(await page.evaluate(() => window.offerClicks), 1);
  assert.equal((await readVisiblePageState(page)).hasWork, false, 'AI không được bấm lại CTA đã xử lý');
  assert.equal(await humanClick(page, page.locator('button')), false);
  await page.setContent(html);
  assert.equal(await handleOfferwallCards(page.mainFrame(), page), 0);
  assert.equal(await page.evaluate(() => window.offerClicks), 1);
  assert.equal(context.pages().length, 1);
});

test('offerwall không click link bị loại trừ, link khác vẫn chỉ mở một lần qua query marketing', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const html = `<div class="offerwall-card"><a class="offerwall-btn" target="_blank" href="${blocked[5]}">Gold</a></div><div class="offerwall-card"><a class="offerwall-btn" target="_blank" href="https://offer.test/child?offer=1&utm_source=one">One</a></div><div class="offerwall-card"><a class="offerwall-btn" target="_blank" href="https://offer.test/child?offer=1&utm_source=two">One again</a></div>`;
  const { context, page } = await createFormScopeFixture(browser, html);
  t.after(() => context.close());
  attachUniqueOfferTabs(context, { mainPage: page });
  assert.equal(await handleOfferwallCards(page.mainFrame(), page), 1);
  assert.equal(context.pages().length, 2);
  assert.ok(context.pages().every(tab => !isExcludedOfferPageUrl(tab.url())));
});


test('click timeout sau lần thử vẫn không bấm lại offer hoặc chạy form.submit dự phòng', async () => {
  let clicks = 0;
  const context = {};
  const page = { context: () => context, url: () => 'https://offer.test/wall', isClosed: () => false };
  const button = { count: async () => 1, isVisible: async () => true, evaluate: async () => ({ ready: true }), click: async () => { clicks++; throw new Error('Timeout after dispatch'); } };
  const frame = { evaluate: async callback => callback.name === 'readOfferwallCards' ? [{ uid: 'one', offerId: 'offer-42', hasBtn: true, destUrl: '' }] : undefined,
    locator: () => ({ first: () => ({ count: async () => 1, locator: () => ({ first: () => button }) }) }) };
  await handleOfferwallCards(frame, page);
  await handleOfferwallCards(frame, page);
  assert.equal(clicks, 1);
});


test('link Gold bị loại trừ vẫn đóng nếu server redirect ngay sang URL khác', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<form><input></form>');
  t.after(() => context.close());
  await context.route('https://secure.usgoldbureau.com/affiliate/affiliate-ira-default/**', route => route.fulfill({ status: 302, headers: { location: 'https://offer.test/redirected' } }));
  attachUniqueOfferTabs(context, { mainPage: page });
  const popup = await context.newPage();
  await popup.goto('https://secure.usgoldbureau.com/affiliate/affiliate-ira-default/?source=fixture').catch(() => {});
  await waitFor(() => popup.isClosed());
  assert.equal(page.isClosed(), false);
});


test('popup window.open qua Gold redirect bị bắt trước khi URL cuối đổi host', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<button>Open</button>');
  t.after(() => context.close());
  await context.route('https://secure.usgoldbureau.com/affiliate/affiliate-ira-default/**', route => route.fulfill({ status: 302, headers: { location: 'https://offer.test/redirected' } }));
  attachUniqueOfferTabs(context, { mainPage: page });
  await installExcludedPopupFilter(context);
  assert.equal(await page.evaluate(() => window.open('https://secure.usgoldbureau.com/affiliate/affiliate-ira-default/?source=fixture') === null), true);
  assert.deepEqual(context.pages(), [page]);
  await page.evaluate(() => { window.open('https://offer.test/allowed'); });
  await waitFor(() => context.pages().length === 2);
});


test('hai offer không có href/id, cùng chữ Claim nhưng action khác nhau vẫn mỗi offer một lần', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const html = '<div class="offerwall-card"><button type="button" class="offerwall-btn" onclick="window.one=(window.one||0)+1">Claim</button></div><div class="offerwall-card"><button type="button" class="offerwall-btn" onclick="window.two=(window.two||0)+1">Claim</button></div>';
  const { context, page } = await createFormScopeFixture(browser, html);
  t.after(() => context.close());
  assert.equal(await handleOfferwallCards(page.mainFrame(), page), 2);
  assert.deepEqual(await page.evaluate(() => [window.one, window.two]), [1, 1]);
  await page.setContent(html);
  assert.equal(await handleOfferwallCards(page.mainFrame(), page), 0);
  assert.deepEqual(await page.evaluate(() => [window.one, window.two]), [1, 1]);
});


test('offer mở form ngay trong thẻ: chặn CTA cũ nhưng vẫn điền form và giữ nút Continue mới', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page, session } = await createFormScopeFixture(browser, `<div class="offerwall-card" data-offer-id="inline-42"><button class="offerwall-btn" type="button" onclick="this.hidden=true;document.getElementById('details').hidden=false">Claim</button><form id="details" hidden><label>First Name<input name="firstname"></label><button type="button" onclick="window.continued=true">Continue</button></form></div>`);
  t.after(() => context.close());
  assert.equal(await handleOfferwallCards(page.mainFrame(), page), 1);
  assert.equal(await hasUnfinishedOfferWork(page), true);
  assert.equal((await readVisiblePageState(page)).hasWork, true);
  await fillPageForms(page, { session, sessionRecord: { firstname: 'Ada' }, options: { autoSubmit: false, enableLeadCheck: false }, triggerLeadCheckAfterEmail() {} });
  assert.equal(await page.locator('input').inputValue(), 'Ada');
  assert.equal(await humanClick(page, page.locator('#details button')), true);
  assert.equal(await page.evaluate(() => window.continued), true);
});
