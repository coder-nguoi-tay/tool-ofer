import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test, { afterEach } from 'node:test';
import { chromium } from 'playwright';
import { isFinancialhelpThankyouUrl } from '../src/leads/actions/is-financialhelp-thankyou-url.mjs';
import { isFinancialhelpPathThankyouUrl } from '../src/leads/actions/is-financialhelp-path-thankyou-url.mjs';
import { isThankYouUrl } from '../src/leads/actions/is-thank-you-url.mjs';
import { watchTrafficBlockedPage } from '../src/leads/actions/watch-traffic-blocked-page.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { captureLeadWatcherTicks, createLeadTestSession } from './helpers/lead-session-fixture.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { autoRefill } from '../src/runtime/constants/auto-refill.mjs';

afterEach(() => { activeBrowsers.clear(); autoRefill.enabled = false; });

test('paththankyou của blog.financialhelpfinder.com là trang trung gian còn nút chuyển tiếp; chỉ thankyou.php mới là xong', () => {
  for (const url of ['https://blog.financialhelpfinder.com/paththankyou.php', 'https://blog.financialhelpfinder.com/paththankyou.php?s=1']) {
    assert.equal(isFinancialhelpPathThankyouUrl(url), true, url);
    assert.equal(isFinancialhelpThankyouUrl(url), false, `${url}: không phải điểm hoàn tất`);
    assert.equal(isThankYouUrl(url), false, `${url}: không đóng như trang cảm ơn chung`);
  }
  for (const url of ['http://blog.financialhelpfinder.com/paththankyou.php', 'https://blog.financialhelpfinder.com/path1c.php', 'https://blog.financialhelpfinder.com.evil.test/paththankyou.php', 'https://evil.test/blog.financialhelpfinder.com/paththankyou.php']) {
    assert.equal(isFinancialhelpPathThankyouUrl(url), false, url);
  }
  assert.equal(isFinancialhelpThankyouUrl('https://financialhelpfinder.com/thankyou.php'), true, 'thankyou.php vẫn là điểm hoàn tất');
});

test('watcher: đứng ở paththankyou (kể cả quá thời gian ổn định 3 giây) không đóng trình duyệt', async t => {
  autoRefill.enabled = false;
  const ticks = captureLeadWatcherTicks(t);
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const { session, page, counters } = createLeadTestSession('198.51.100.95');
  page.frames = () => [page];
  page.evaluate = async callback => callback.name === 'detectOfferContentInPage' ? { hasForm: false, hasChoices: false, challenge: false, worked: true } : null;
  page.currentUrl = 'https://blog.financialhelpfinder.com/paththankyou.php';
  watchTrafficBlockedPage(session);
  page.emit('framenavigated', page);
  for (let round = 0; round < 6; round++) {
    for (const tick of ticks) tick();
    for (let i = 0; i < 20; i++) await new Promise(resolve => setImmediate(resolve));
    now += 2000;
  }
  assert.equal(counters.browserCloses, 0, 'paththankyou còn nút chuyển tiếp, không được đóng');
});

test('autofill bấm nút chuyển tiếp "Return to Financial Help Finder" trên paththankyou', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  const navigations = [];
  // Cấu trúc giống trang thật (lưu 2026-11-11), không chứa dữ liệu người dùng.
  const html = '<main><h1>Thank You! You\'re all set.</h1><p>Your information has been received.</p><a class="thankyou-button" href="https://financialhelpfinder.com/">Return to Financial Help Finder</a></main>';
  await context.route('**/*', route => {
    if (!route.request().isNavigationRequest()) return route.abort();
    navigations.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: route.request().url().includes('paththankyou.php') ? html : '<p>Financial Help Finder</p>' });
  });
  const page = await context.newPage();
  await page.goto('https://blog.financialhelpfinder.com/paththankyou.php');
  const session = { slot: 1, mainPage: page, browser: context, addBrowserLog() {}, autofillFields: 0, autofillActions: 0 };
  for (let round = 0; round < 3 && navigations.length < 2; round++) {
    await fillPageForms(page, { session, sessionRecord: { firstname: 'Fixture' }, options: { autoSubmit: true, enableLeadCheck: false }, triggerLeadCheckAfterEmail() {} });
    await page.waitForTimeout(500);
  }
  assert.ok(navigations.includes('https://financialhelpfinder.com/'), 'autofill phải bấm nút chuyển tiếp');
});
