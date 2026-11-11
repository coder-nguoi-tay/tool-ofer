import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isFinancialhelpThankyouUrl } from '../src/leads/actions/is-financialhelp-thankyou-url.mjs';
import { canCompleteFinancialhelpSession } from '../src/leads/actions/can-complete-financialhelp-session.mjs';
import { watchTrafficBlockedPage } from '../src/leads/actions/watch-traffic-blocked-page.mjs';
import { captureLeadWatcherTicks, createLeadTestSession } from './helpers/lead-session-fixture.mjs';
import { reserveOfferwallTabSlot } from '../src/autofill/reserve-offerwall-tab-slot.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';

afterEach(() => { activeBrowsers.clear(); autoRefill.enabled = false; autoRefill.stopRequested = false; });

/**
 * Tạo tab giả trả về trạng thái offer thay vì đọc website thật hoặc proxy thật.
 * @param {object} page Tab giả của fixture lead.
 * @param {object} content Form/câu hỏi/challenge đang hiển thị trong tab.
 * @return {void} Gắn bộ đọc DOM tối giản cho checker hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function setOfferContent(page, content = {}) {
  page.frames = () => [page];
  page.evaluate = async callback => callback.name === 'detectOfferContentInPage'
    ? { hasForm: false, hasChoices: false, challenge: false, ...content }
    : callback.name ? null : false;
}

test('chỉ khớp đúng host/path thankyou, không chấp nhận host giả hoặc trang khác', () => {
  assert.equal(isFinancialhelpThankyouUrl('https://financialhelpfinder.com/thankyou.php?done=1'), true);
  for (const url of ['https://evil.test/financialhelpfinder.com/thankyou.php', 'https://financialhelpfinder.com.evil.test/thankyou.php', 'https://financialhelpfinder.com/form', 'http://financialhelpfinder.com/thankyou.php']) assert.equal(isFinancialhelpThankyouUrl(url), false);
});

test('giữ browser khi còn form/câu hỏi, popup đang mở, AI chạy hoặc tab chưa tải xong', async t => {
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  const { session, page, browser } = createLeadTestSession('192.0.2.60');
  page.currentUrl = 'https://financialhelpfinder.com/thankyou.php'; setOfferContent(page);
  const other = await browser.newPage(); other.currentUrl = 'https://offer.test/form'; setOfferContent(other, { hasForm: true });
  assert.equal(await canCompleteFinancialhelpSession(session), false); now += 4000;
  assert.equal(await canCompleteFinancialhelpSession(session), false);
  setOfferContent(other, { hasChoices: true });
  assert.equal(await canCompleteFinancialhelpSession(session), false);
  setOfferContent(other); session.aiAssistRunning = true;
  assert.equal(await canCompleteFinancialhelpSession(session), false); session.aiAssistRunning = false;
  page.context = () => browser;
  const release = reserveOfferwallTabSlot(page, 10);
  assert.equal(await canCompleteFinancialhelpSession(session), false); release();
  other.evaluate = async callback => callback.name === 'detectOfferContentInPage' ? { hasForm: false, hasChoices: false } : callback.name ? null : true;
  assert.equal(await canCompleteFinancialhelpSession(session), false);
  setOfferContent(other);
  assert.equal(await canCompleteFinancialhelpSession(session), true);
});

test('FinancialHelpFinder thankyou hết offer đóng cả browser có lead nhưng không hạ cờ lead', async t => {
  const ticks = captureLeadWatcherTicks(t);
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  const { session, page, counters } = createLeadTestSession('192.0.2.61');
  session.leadCheckStatus = 'confirmed';
  page.currentUrl = 'https://financialhelpfinder.com/thankyou.php'; setOfferContent(page);
  activeBrowsers.add(session);
  watchTrafficBlockedPage(session);
  await new Promise(resolve => setImmediate(resolve));
  now += 4000;
  ticks[0]();
  for (let index = 0; index < 5; index++) await new Promise(resolve => setImmediate(resolve));
  assert.equal(counters.browserCloses, 1);
  assert.equal(session.isClosed, true);
  assert.equal(session.leadCheckStatus, 'confirmed');
  assert.equal(activeBrowsers.has(session), false);
});


test('DOM thật: thankyou giữ form trong iframe và offer chưa mở, sau khi hết việc mới hoàn tất', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<h1>Thank you</h1><iframe id="offer-frame" srcdoc="<form><input name=firstname></form>"></iframe><div class="offerwall-card"><a href="https://offer.test/next">Offer</a></div>');
  t.after(() => context.close());
  await page.goto('https://financialhelpfinder.com/thankyou.php');
  const session = { browser: context, mainPage: page, leadCheckStatus: 'confirmed', exitIp: '192.0.2.63' };
  let now = Date.now();t.mock.method(Date, 'now', () => now);
  assert.equal(await canCompleteFinancialhelpSession(session), false);now += 4000;
  assert.equal(await canCompleteFinancialhelpSession(session), false);
  await page.locator('#offer-frame').evaluate(element => element.remove());
  assert.equal(await canCompleteFinancialhelpSession(session), false, 'Giữ thẻ offerwall chưa mở');
  await page.locator('.offerwall-card').evaluate(element => element.dataset.uxOpened = '1');
  assert.equal(await canCompleteFinancialhelpSession(session), true);
  const popup = await context.newPage();
  assert.equal(await canCompleteFinancialhelpSession(session), false, 'Tab mới phải được kiểm tra trước');
  now += 4000;
  assert.equal(await canCompleteFinancialhelpSession(session), false, 'about:blank đang tải phải giữ browser');
  await popup.goto('https://offer.test/ready');
  await popup.setContent('<form><button>Yes</button><button>No</button></form>');
  assert.equal(await canCompleteFinancialhelpSession(session), false);now += 4000;
  assert.equal(await canCompleteFinancialhelpSession(session), false, 'Câu hỏi ở popup phải được giữ');
  await popup.close();
  assert.equal(await canCompleteFinancialhelpSession(session), false);now += 4000;
  assert.equal(await canCompleteFinancialhelpSession(session), true);
});


test('thankyou giữ browser có lead khi Yes/No là link tách wrapper hoặc checkbox ẩn', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<h1>Thank you</h1>');
  t.after(() => context.close());
  await page.goto('https://financialhelpfinder.com/thankyou.php');
  const other = await context.newPage();
  await other.goto('https://offer.test/questions');
  const session = { browser: context, mainPage: page, leadCheckStatus: 'confirmed', exitIp: '192.0.2.64' };
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  assert.equal(await canCompleteFinancialhelpSession(session), false);
  now += 4000;
  for (const html of [
    '<section><div><a href="#">Yes</a></div><div><a href="#">No</a></div></section>',
    '<section><div><label><input type="checkbox" style="display:none">Yes</label></div><div><label><input type="checkbox" style="display:none">No</label></div></section>'
  ]) {
    await other.setContent(html);
    assert.equal(await canCompleteFinancialhelpSession(session), false, 'Còn đáp án phải giữ toàn bộ browser');
  }
});
