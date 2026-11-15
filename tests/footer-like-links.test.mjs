import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';

const body = '<main style="max-width:700px;margin:auto"><h1>Thank you!</h1><p>Your information has been received. We will be in touch shortly with more details about your request.</p></main>';
const links = (...items) => items.map(([text, href]) => `<a href="${href}">${text}</a>`).join(' | ');
const LEGAL = [['Home', '/'], ['About', '/about'], ['Blog', '/blog'], ['Privacy Policy', '/privacy'], ['Terms', '/terms'], ['Contact', '/contact']];

/**
 * Mở trang mẫu, chạy vài lượt autofill và trả về các điều hướng app đã gây ra (trang không được rời đi).
 * @param {object} browser Chromium đang chạy.
 * @param {string} html Nội dung trang.
 * @return {Promise<{navigations:string[],page:object,context:object}>} Điều hướng đã bị chặn lại để ghi nhận.
 */
async function runAutofill(browser, html) {
  const context = await browser.newContext();
  const navigations = [];
  let first = true;
  await context.route('**/*', route => {
    if (!route.request().isNavigationRequest()) return route.abort();
    if (first) { first = false; return route.fulfill({ contentType: 'text/html', body: html }); }
    navigations.push(new URL(route.request().url()).pathname);
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto('https://offer.test/page');
  const session = { slot: 1, mainPage: page, browser: context, addBrowserLog() {}, autofillFields: 0, autofillActions: 0 };
  for (let round = 0; round < 3; round++) {
    await fillPageForms(page, { session, sessionRecord: { firstname: 'Fixture' }, options: { autoSubmit: true, enableLeadCheck: false }, triggerLeadCheckAfterEmail() {} }).catch(() => {});
    await page.waitForTimeout(1300);
  }
  return { navigations, page, context };
}

const FOOTER_LIKE = {
  'section cuối: Home/About/Blog/Privacy/Terms/Contact': body + `<section style="text-align:center">${links(...LEGAL)}</section>`,
  'div cuối: About Us/Contact/Advertise/Careers': body + `<div class="links" style="text-align:center">${links(['About Us', '/about-us'], ['Contact', '/contact'], ['Advertise', '/advertise'], ['Careers', '/careers'])}</div>`,
  'section cuối giới thiệu: Our Story/How It Works/Get in Touch/Who We Are': body + `<section style="text-align:center">${links(['Our Story', '/our-story'], ['How It Works', '/how-it-works'], ['Get in Touch', '/get-in-touch'], ['Who We Are', '/who-we-are'])}</section>`,
  'div cuối dạng danh sách ul/li + dòng bản quyền': body + `<div style="text-align:center"><ul style="list-style:none">${LEGAL.map(([text, href]) => `<li><a href="${href}">${text}</a></li>`).join('')}</ul><p>© 2026 Example Inc. All rights reserved.</p></div>`,
  'thẻ <footer> thật (đã an toàn từ trước)': body + `<footer style="text-align:center">${links(...LEGAL)}</footer>`,
  'thanh link trên đầu trang không có thẻ nav': `<div style="text-align:center">${links(['Home', '/'], ['About', '/about'], ['Contact', '/contact'])}</div>` + body,
};

test('link footer/giới thiệu/policy/contact không bị bấm, kể cả khi trang không có thẻ footer mà để ở section cuối', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  for (const [name, html] of Object.entries(FOOTER_LIKE)) {
    await t.test(name, async () => {
      const { navigations, context } = await runAutofill(browser, html);
      await context.close();
      assert.deepEqual(navigations, [], 'app không được bấm link rời khỏi trang');
    });
  }
});

test('câu hỏi có đáp án dạng link vẫn được trả lời; link pháp lý ở section cuối không bị bấm', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const question = '<main style="text-align:center"><h3>Do you rent or own your home?</h3><a class="btn-option" href="#rent" onclick="this.dataset.clicked=1">Rent</a> <a class="btn-option" href="#own" onclick="this.dataset.clicked=1">Own</a></main>';
  const { navigations, page, context } = await runAutofill(browser, question + `<section style="text-align:center;margin-top:40px">${links(...LEGAL)}</section>`);
  t.after(() => context.close());
  assert.deepEqual(navigations, []);
  assert.ok(await page.locator('main a[data-clicked]').count() >= 1, 'đáp án Rent/Own vẫn phải được chọn');
});

test('không chặn nhầm đáp án thật có chữ trùng từ footer (Home / Auto / Life)', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const question = '<main style="text-align:center"><h3>Which insurance are you interested in?</h3><a href="#home" onclick="this.dataset.clicked=1">Home</a> <a href="#auto" onclick="this.dataset.clicked=1">Auto</a> <a href="#life" onclick="this.dataset.clicked=1">Life</a></main>';
  const { page, context } = await runAutofill(browser, question);
  t.after(() => context.close());
  assert.equal(await page.locator('a[data-ux-footer-link]').count(), 0, 'cụm đáp án không bị đánh dấu là link footer');
  assert.ok(await page.locator('a[data-clicked]').count() >= 1, 'đáp án vẫn được chọn');
});
