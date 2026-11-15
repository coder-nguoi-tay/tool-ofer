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

/**
 * Mở paththankyou với đúng khối HTML người dùng cung cấp (2026-11-15); `spacer` đẩy nút xuống sâu như trang dài trên điện thoại.
 * @param {object} t Ngữ cảnh test.
 * @param {{spacer?:number,viewport?:object}} [options] Khoảng đệm phía trên nút và kích thước màn hình.
 * @return {Promise<{page:object,context:object,navigations:string[]}>} Trang và danh sách điều hướng.
 */
async function openPathThankyou(t, { spacer = 0, viewport = { width: 384, height: 832 } } = {}) {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport });
  const navigations = [];
  const html = `<main><h1>Thank You!</h1><div style="height:${spacer}px"></div><div class="thankyou-actions">
                <a href="https://financialhelpfinder.com/" class="thankyou-button">
                    Return to Financial Help Finder
                </a>
            </div></main>`;
  await context.route('**/*', route => {
    if (!route.request().isNavigationRequest()) return route.abort();
    navigations.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: route.request().url().includes('paththankyou.php') ? html : '<p>Financial Help Finder</p>' });
  });
  const page = await context.newPage();
  await page.goto('https://blog.financialhelpfinder.com/paththankyou.php');
  return { page, context, navigations };
}

test('paththankyou: nút nằm sâu dưới trang trên màn điện thoại vẫn được bấm qua fillPageForms', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { page, context, navigations } = await openPathThankyou(t, { spacer: 6000 });
  const logs = [];
  const session = { slot: 1, mainPage: page, browser: context, addBrowserLog() {}, autofillFields: 0, autofillActions: 0 };
  for (let round = 0; round < 3 && navigations.length < 2; round++) {
    await fillPageForms(page, { session, sessionRecord: { firstname: 'Fixture' }, options: { autoSubmit: true, enableLeadCheck: false, onLog: entry => logs.push(entry) }, triggerLeadCheckAfterEmail() {} });
    await page.waitForTimeout(500);
  }
  assert.ok(navigations.includes('https://financialhelpfinder.com/'), 'phải bấm "Return to Financial Help Finder" dù nút ở sâu dưới trang');
  assert.ok(logs.some(entry => entry.type === 'paththankyou_button_clicked'));
  assert.ok(session.autofillActions >= 1, 'tính là một thao tác tiến triển');
});

test('paththankyou: chỉ bấm đúng trang này, không bấm dồn, và tôn trọng dừng-sau-lead / tắt auto submit', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { clickPathThankyouButton } = await import('../src/autofill/financialhelp/click-path-thankyou-button.mjs');
  const { page, navigations } = await openPathThankyou(t);
  const clicks = () => page.evaluate(() => Number(document.querySelector('a.thankyou-button').dataset.uxSubmitCount || 0));
  await page.evaluate(() => document.querySelector('a.thankyou-button').addEventListener('click', event => event.preventDefault()));

  assert.equal(await clickPathThankyouButton(page, { stopAutofillOnLead: true, enableLeadCheck: true, exitIp: '198.51.100.7', confirmedLeadIp: '198.51.100.7' }, {}), true, 'trang này đã được xử lý');
  assert.equal(await clicks(), 0, 'có lead + bật dừng autofill: không bấm');
  assert.equal(await clickPathThankyouButton(page, {}, { autoSubmit: false }), true);
  assert.equal(await clicks(), 0, 'tắt auto submit: không bấm');

  const session = {};
  assert.equal(await clickPathThankyouButton(page, session, {}), true);
  assert.equal(await clicks(), 1);
  assert.equal(await clickPathThankyouButton(page, session, {}), true);
  assert.equal(await clicks(), 1, 'không bấm dồn trong lúc chờ trang chuyển');
  assert.equal(navigations.filter(url => url === 'https://financialhelpfinder.com/').length, 0);

  await page.goto('https://blog.financialhelpfinder.com/path1c.php');
  assert.equal(await clickPathThankyouButton(page, {}, {}), false, 'trang khác: không đụng tới');
});

test('popup paththankyou không bị đóng như trang cảm ơn; thankyou/thanks vẫn đóng như cũ', async () => {
  const { isCompletedPopupUrl } = await import('../src/leads/actions/is-completed-popup-url.mjs');
  for (const url of ['https://blog.financialhelpfinder.com/paththankyou.php', 'https://blog.financialhelpfinder.com/paththankyou.php?s=1']) assert.equal(isCompletedPopupUrl(url), false, url);
  for (const url of ['https://offer.test/thankyou.php', 'https://offer.test/thank-you/', 'https://offer.test/thanks.html', 'https://offer.test/thank_you?x=1', 'https://offer.test/thankyou']) assert.equal(isCompletedPopupUrl(url), true, url);
  for (const url of ['https://offer.test/form', 'https://offer.test/confirmation.php', '', null]) assert.equal(isCompletedPopupUrl(url), false, String(url));
});

test('thankyou.php: link tải PDF "The Guide To Financial Assistance" không bị coi là đáp án khảo sát và không bị bấm', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  const navigations = [];
  // Markup thật của financialhelpfinder.com/thankyou.php (bản chụp 2026-11-11), không chứa dữ liệu người dùng.
  const html = `<header class="header"><img alt="Financial help finder logo" class="fhf_icon"></header>
    <div class="section_1"><div class="content">
      <div class="ribbon big"><h1 class="thank_you-h1">Thank You for Joining FinancialHelpFinder.com!</h1></div>
      <h2 class="thank_you-h2">Dive into Your Free Resource: <a href="GuideToFinancialAssistanceFromFinancialHelpFinderDotCom.pdf" class="thank_you-a">'The Guide To Financial Assistance'</a></h2>
      <p>As a token of our appreciation, please enjoy your complimentary copy of <a href="GuideToFinancialAssistanceFromFinancialHelpFinderDotCom.pdf" class="thank_you-a">"The Guide To Financial Assistance."</a> This comprehensive eBook is filled with invaluable information.</p>
      <p class="big"><a href="GuideToFinancialAssistanceFromFinancialHelpFinderDotCom.pdf" class="thank_you-a">Click here to download your guide now!</a> Additionally, explore our thank you page.</p>
    </div></div>`;
  await context.route('**/*', route => {
    if (!route.request().isNavigationRequest()) return route.abort();
    navigations.push(route.request().url());
    return route.fulfill({ contentType: 'text/html', body: route.request().url().endsWith('thankyou.php') ? html : '<p>file</p>' });
  });
  const page = await context.newPage();
  await page.goto('https://financialhelpfinder.com/thankyou.php');
  const session = { slot: 1, mainPage: page, browser: context, addBrowserLog() {}, autofillFields: 0, autofillActions: 0 };
  for (let round = 0; round < 3; round++) {
    await fillPageForms(page, { session, sessionRecord: { firstname: 'Fixture' }, options: { autoSubmit: true, enableLeadCheck: false }, triggerLeadCheckAfterEmail() {} });
    await page.waitForTimeout(400);
  }
  assert.deepEqual(navigations.filter(url => /\.pdf/i.test(url)), [], 'không được điều hướng tab sang file PDF');
  assert.equal(page.url(), 'https://financialhelpfinder.com/thankyou.php', 'tab vẫn ở trang thank you');
  assert.equal(await page.locator('a.thank_you-a[data-ux-choice-id], a.thank_you-a[data-ux-answer-attempt-at]').count(), 0, 'link PDF không được gắn dấu đáp án');
});

test('cụm đáp án dạng link thường (không phải file tải) vẫn được nhận diện và bấm như cũ', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  // Link "#..." không điều hướng: chỉ kiểm việc nhận diện + bấm, tránh chờ trang chuyển.
  const html = '<div class="q"><h3>Do you rent or own your home?</h3><a href="#rent" onclick="this.dataset.clicked=1">Rent</a> <a href="#own" onclick="this.dataset.clicked=1">Own</a></div>';
  await context.route('**/*', route => route.request().isNavigationRequest() ? route.fulfill({ contentType: 'text/html', body: html }) : route.abort());
  const page = await context.newPage();
  await page.goto('https://offer.test/question');
  const session = { slot: 1, mainPage: page, browser: context, addBrowserLog() {}, autofillFields: 0, autofillActions: 0 };
  for (let round = 0; round < 3 && !(await page.locator('a[data-clicked]').count()); round++) {
    await fillPageForms(page, { session, sessionRecord: { firstname: 'Fixture' }, options: { autoSubmit: true, enableLeadCheck: false }, triggerLeadCheckAfterEmail() {} });
    await page.waitForTimeout(400);
  }
  assert.equal(await page.locator('a[data-ux-choice-id]').count(), 2, 'hai link đáp án vẫn được nhận diện');
  assert.ok(await page.locator('a[data-clicked]').count() >= 1, 'một đáp án vẫn được bấm');
});
