import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { attachAutofillPageWatcher } from '../src/autofill/attach-autofill-page-watcher.mjs';
import { attachAutofillPageWatcher as attachOfferWatcher } from '../src/autofill/offers/2615/solver/attach-autofill-page-watcher.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';

const widget = '<div class="y-captcha" data-ycaptcha-initialized="true"><div class="ycaptcha-captcha-area"><div role="slider">Xác minh</div></div></div>';
const form = '<main><form><input name="firstname"></form></main>';
const skip = !existsSync(chromium.executablePath()) && 'Chưa cài Chromium của Playwright';

/**
 * Đợi log từ timer hoặc sự kiện của tab mà không phụ thuộc vào tốc độ renderer.
 * @param {Function} observed Kiểm tra trạng thái watcher hoặc số lần quét.
 * @return {Promise<void>} Hoàn tất khi quan sát được kết quả mong muốn.
 * @throws {Error} Khi watcher không đạt trạng thái trong thời gian giới hạn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function waitUntil(observed) {
  const deadline = Date.now() + 5000;
  while (!observed() && Date.now() < deadline) await delay(20);
  assert.ok(observed());
}

for (const [name, watch] of [['chung', attachAutofillPageWatcher], ['2615', attachOfferWatcher]]) {
  test(`watcher ${name} giữ đúng tab có CAPTCHA và xác nhận đúng lượt`, { skip }, async t => {
    const browser = await chromium.launch();
    t.after(() => browser.close());
    const { page, session, context } = await createFormScopeFixture(browser, form + widget);
    const events = [];
    const passes = new Map();
    const settings = {
      trackedPages: new WeakSet(), session, record: {},
      options: { aiConfig: { enabled: false }, onLog: event => events.push(event.type) },
      fillVisibleForms: async tab => { passes.set(tab, (passes.get(tab) || 0) + 1); return { waitingForAddress: true }; },
      checkLeadAfterEmailOnPage() {}, isSpamAdUrl: () => false, watchPage() {},
    };
    watch(page, settings);
    await waitUntil(() => page._manualCaptchaPending);
    const confirmation = page.evaluate(() => window.confirm('Discard unsaved changes?'));
    await waitUntil(() => Boolean(page._manualFormDialog));
    await page._manualFormDialog.dialog.dismiss();
    delete page._manualFormDialog;
    assert.equal(await confirmation, false);
    const ticket = page._manualCaptchaRequestId;
    const sibling = await context.newPage();
    await sibling.goto('https://form-scope.test/other');
    await sibling.setContent(form);
    watch(sibling, settings);
    await waitUntil(() => passes.has(sibling));
    page.triggerAutofillScan();
    assert.equal(await page.confirmManualCaptcha(ticket), false);
    assert.equal(events.filter(type => type === 'manual_captcha_required').length, 1);
    assert.equal(passes.has(page), false);
    await page.locator('.y-captcha').evaluate(element => { element.hidden = true; });
    await Promise.all([...session._pageScans].map(scan => scan(true)));
    assert.equal(page._manualCaptchaPending, true);
    assert.equal(passes.has(page), false);
    assert.equal(await page.confirmManualCaptcha('expired'), false);
    assert.equal(await page.confirmManualCaptcha(ticket), true);
    await waitUntil(() => passes.has(page));
    assert.equal(await page.confirmManualCaptcha(ticket), false);
    await page.locator('.y-captcha').evaluate(element => { element.hidden = false; });
    page.triggerAutofillScan();
    await waitUntil(() => page._manualCaptchaPending);
    assert.notEqual(page._manualCaptchaRequestId, ticket);
    await context.route('**/next', route => route.fulfill({ contentType: 'text/html', body: form }));
    await page.goto('https://form-scope.test/next');
    await waitUntil(() => !page._manualCaptchaPending);
  });
}

test('watcher phát hiện widget mới ngay cả khi lượt điền trước đang chờ', { skip }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, form);
  let finishFill;
  const waiting = new Promise(resolve => { finishFill = resolve; });
  let started = false;
  try {
    attachAutofillPageWatcher(page, {
      trackedPages: new WeakSet(), options: { aiConfig: { enabled: false } }, session, record: {},
      fillVisibleForms: async () => { started = true; await waiting; return { waitingForAddress: true }; },
      checkLeadAfterEmailOnPage() {}, isSpamAdUrl: () => false, watchPage() {},
    });
    await waitUntil(() => started);
    await page.evaluate(html => document.querySelector('form').insertAdjacentHTML('beforeend', html), widget);
    await waitUntil(() => page._manualCaptchaPending);
  } finally { finishFill(); }
});

test('CAPTCHA được bàn giao trước khi agent nhận quyền điền form', { skip }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, form + widget);
  let starts = 0;
  attachAutofillPageWatcher(page, {
    trackedPages: new WeakSet(), session, record: {}, options: {
      aiConfig: { enabled: true, mode: 'form_agent' },
      createTransport() { starts++; return { close() {}, kill() {} }; },
    },
    fillVisibleForms: () => assert.fail('Không được tự điền khi CAPTCHA đang hiển thị'),
    checkLeadAfterEmailOnPage() {}, isSpamAdUrl: () => false, watchPage() {},
  });
  await waitUntil(() => page._manualCaptchaPending);
  await Promise.all([...session._pageScans].map(scan => scan(true)));
  assert.equal(starts, 0);
  assert.ok(!page._continuousAgent);
});
