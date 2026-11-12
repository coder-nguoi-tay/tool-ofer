import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { findSubmitButton } from '../src/autofill/find-submit-button.mjs';
import { SURVEY_LEGAL_NOISE_RE } from '../src/survey-solver/state/survey-legal-noise-re.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';

/**
 * Mô tả nút submit được chọn bằng chuỗi ngắn: assert trên Locator thật in cả kết nối browser rất chậm.
 * @param {object} page Tab Playwright.
 * @return {Promise<string|null>} outerHTML rút gọn của nút, hoặc null nếu không chọn nút nào.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function describeSubmit(page) {
  const button = await findSubmitButton(page);
  return button ? (await button.evaluate(element => element.outerHTML)).slice(0, 200) : null;
}

test('regex pháp lý dùng chung: nhận trang chính sách thật từ log, không chặn CTA', () => {
  for (const noise of ['https://contact.uplevelrewards.com/policies/page/rzu_program_requirements_?utm_source=footer-partial', 'Purchase & Program Requirements', 'https://contact.rewardsclaims.com/policies/page/biometric_consent', 'Privacy Policy']) {
    assert.equal(SURVEY_LEGAL_NOISE_RE.test(noise), true, noise);
  }
  for (const cta of ['Continue', 'YES — Request My Review', 'Claim My Gift', 'Get Free Samples', 'Next']) {
    assert.equal(SURVEY_LEGAL_NOISE_RE.test(cta), false, cta);
  }
});

test('không chọn link chính sách làm nút submit', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());

  await t.test('form chỉ còn link "Purchase & Program Requirements" → không có nút submit', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form id="main"><input type="email" name="email"><a href="https://contact.uplevelrewards.com/policies/page/rzu_program_requirements_?utm_source=footer-partial" target="_blank">Purchase &amp; Program Requirements</a></form>');
    try { assert.equal(await describeSubmit(page), null); }
    finally { await context.close(); }
  });

  await t.test('form có link chính sách và nút thật → chọn nút thật', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form id="main"><input type="email" name="email"><a href="https://x.test/policies/page/about_our_program">About our program</a><button type="button" id="go">YES — Request My Review</button></form>');
    try { assert.equal(await (await findSubmitButton(page)).getAttribute('id'), 'go'); }
    finally { await context.close(); }
  });

  await t.test('ngoài form: link chữ "Next" trỏ trang /policies/ → bỏ qua', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<div class="wrap"><a class="btn" href="https://x.test/policies/page/about_our_program">Next</a></div>');
    try { assert.equal(await describeSubmit(page), null); }
    finally { await context.close(); }
  });
});

test('không chọn nút quay lại có class back-arrow dù chữ là "Submit" (account.yougov.com)', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const [name, html, expected] of [
    ['trong form, cạnh nút thật', '<form id="main"><input type="email" name="email"><a href="#" class="back-arrow large secondary">Submit</a><button type="button" id="go">Next</button></form>', 'go'],
    ['ngoài form, chỉ có back-arrow', '<div class="wrap"><p>Question</p><a href="#" class="back-arrow large secondary">Submit</a></div>', null],
    ['class btn-back / id prev', '<div class="wrap"><a href="#" id="prev" class="btn">Continue</a><a href="#" class="btn-back">Next</a></div>', null],
    ['class có chữ "background"/"feedback" không bị loại', '<form id="main"><input type="email" name="email"><a href="#" id="ok" class="btn-continue background-blue feedback">Continue</a></form>', 'ok'],
  ]) {
    await t.test(name, async () => {
      const { context, page } = await createFormScopeFixture(browser, html);
      try {
        const button = await findSubmitButton(page);
        assert.equal(button ? await button.getAttribute('id') ?? (await button.evaluate(element => element.outerHTML)) : null, expected);
      } finally { await context.close(); }
    });
  }
});
