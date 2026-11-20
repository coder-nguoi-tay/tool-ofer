import { fillAlphaIntentSpecialFields } from '../src/autofill/fill-alpha-intent-special-fields.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { inspectAutofillChallenge } from '../src/autofill/watchdog/inspect-autofill-challenge.mjs';
import { inspectPageManualCaptcha } from '../src/autofill/watchdog/inspect-page-manual-captcha.mjs';
import { getAutofillScanDelay } from '../src/autofill/watchdog/get-autofill-scan-delay.mjs';
import { attachAutofillPageWatcher } from '../src/autofill/attach-autofill-page-watcher.mjs';
import { attachAutofillPageWatcher as attachOffer2615PageWatcher } from '../src/autofill/offers/2615/solver/attach-autofill-page-watcher.mjs';
import { tryFastTextInput } from '../src/autofill/interaction/try-fast-text-input.mjs';
import { humanType } from '../src/autofill/human-type.mjs';
import { humanClick } from '../src/autofill/human-click.mjs';
import { selectOptionWithHumanInteraction } from '../src/autofill/select/select-option-with-human-interaction.mjs';
import { fillSelectOrTextField } from '../src/autofill/fill-select-or-text-field.mjs';
import { configurePageMousePolicy } from '../src/autofill/interaction/configure-page-mouse-policy.mjs';
import { blockAiForState } from '../src/ai-assist/retry/ai-state-gate.mjs';
import { readVisiblePageState } from '../src/ai-assist/visible-state/read-visible-page-state.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';

/**
 * Chờ callback watchdog trong giới hạn ngắn mà không phụ thuộc nhịp timer cố định.
 * @param {Function} condition Điều kiện nghiệp vụ cần được callback cập nhật.
 * @return {Promise<void>} Hoàn tất khi điều kiện đúng, ném assertion nếu quá hạn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function waitForCondition(condition) {
  const deadline = Date.now() + 2500;
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(condition(), 'Callback không hoàn tất trong thời gian cho phép');
}

test('giãn scan khi đứng, giữ nhịp nhanh lúc còn tiến triển', () => {
  assert.equal(getAutofillScanDelay(0), 500);
  assert.equal(getAutofillScanDelay(3), 1500);
  assert.equal(getAutofillScanDelay(6), 5000);
  assert.equal(getAutofillScanDelay(0, false), 5000);
});

test('slot sau dùng fill đã xác minh, không gõ từng ký tự; giá trị bị website xóa không được nhận thành công', async () => {
  let value = '', keyboardCalls = 0;
  const page = { keyboard: { type: async () => { keyboardCalls++; } } };
  configurePageMousePolicy(page, { slot: 2 });
  const field = { fill: async text => { value = text; }, inputValue: async () => value };
  await humanType(field, 'Ada', page);
  assert.equal(value, 'Ada');
  assert.equal(keyboardCalls, 0);
  assert.equal(await tryFastTextInput({ fill: async () => {}, inputValue: async () => '' }, 'Ada'), false);
  assert.equal(await tryFastTextInput({ fill: async () => {}, inputValue: async () => '(202) 555-0100' }, '2025550100'), true);
});

const skip = !existsSync(chromium.executablePath()) && 'Chưa cài Chromium của Playwright';
test('chỉ bàn giao CAPTCHA đang hiển thị, kể cả trong iframe lồng khác origin', { skip }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  const slider = '<div class="y-captcha" data-ycaptcha-initialized="true"><div class="ycaptcha-captcha-area"><div role="slider">Slide to continue</div></div></div>';
  const form = '<form><input name="email"><div role="slider" tabindex="0">Điểm hài lòng</div></form>';
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body:
    route.request().url() === 'https://challenge.test/puzzle' ? slider : form }));
  const page = await context.newPage();
  await page.goto('https://form.test/');
  await page.setContent(form + '<script type="application/json">{"widget":"ycaptcha"}</script>' +
    '<div class="y-captcha"></div><div hidden>' + slider + '</div>');
  assert.equal(await inspectPageManualCaptcha(page), false);
  await page.setContent(form + slider);
  assert.equal(await inspectPageManualCaptcha(page), true);
  await page.locator('.y-captcha').evaluate(widget => widget.remove());
  assert.equal(await inspectPageManualCaptcha(page), false);

  await page.setContent(form + '<section style="opacity:0"><iframe srcdoc="&lt;iframe src=&quot;https://challenge.test/puzzle&quot;&gt;&lt;/iframe&gt;"></iframe></section>');
  const child = page.frames().find(frame => frame.url() === 'https://challenge.test/puzzle');
  const probe = t.mock.method(child, 'evaluate', async () => { throw new Error('Frame đang đổi document'); });
  assert.equal(await inspectPageManualCaptcha(page), false);
  assert.equal(probe.mock.callCount(), 0);
  await page.locator('section').evaluate(section => section.style.removeProperty('opacity'));
  assert.equal(await inspectPageManualCaptcha(page), false);
  probe.mock.restore();
  assert.equal(await inspectPageManualCaptcha(page), true);
  const changingFrame = t.mock.method(child, 'evaluate', async () => { throw new Error('Frame đang đổi document'); });
  await assert.rejects(inspectPageManualCaptcha(page), /Frame đang đổi document/);
  changingFrame.mock.restore();
  await page.locator('section').evaluate(section => section.remove());
  assert.equal(await inspectPageManualCaptcha(page), false);

  await page.setContent(form + '<div id="rc-imageselect-target"><button>Ảnh mẫu</button></div>');
  assert.equal(await inspectPageManualCaptcha(page), true);
  await page.setContent(form + '<iframe aria-hidden="true" src="https://challenge.test/recaptcha/api2/bframe"></iframe>');
  assert.equal(await inspectPageManualCaptcha(page), false);
  await page.locator('iframe').evaluate(frame => frame.removeAttribute('aria-hidden'));
  assert.equal(await inspectPageManualCaptcha(page), true);
  await page.locator('iframe').evaluate(frame => Object.assign(frame.style, { position: 'absolute', top: '-10000px' }));
  assert.equal(await inspectPageManualCaptcha(page), false);
});

test('CAPTCHA tới giữa chuỗi gõ thì dừng ký tự tiếp theo và không chuyển sang fill dự phòng', async () => {
  const characters = [];
  const page = { waitForTimeout: async () => {}, keyboard: { type: async value => {
    characters.push(value);
    page._manualCaptchaPending = true;
  } } };
  const field = { focus: async () => {}, evaluate: async () => {}, inputValue: async () => '', fill: () => assert.fail('Tab đang chờ xác minh') };
  await fillSelectOrTextField({ session: {}, page, field, metadata: { type: 'text', names: ['firstname'] }, valueToFill: 'Test', options: {}, frameProgress: {}, record: {} });
  assert.deepEqual(characters, ['T']);
});

test('CAPTCHA tới trong lúc điền nhanh dừng cả gõ, chọn và click; thao tác thủ công vẫn hoạt động', { skip }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page } = await createFormScopeFixture(browser, '<form><input id="name"><input id="confirm" type="checkbox"><select><option>A</option><option>B</option></select></form>');
  configurePageMousePolicy(page, { slot: 2 });
  await page.locator('#name').evaluate(element => element.addEventListener('click', () => console.info('field-clicked'), { once: true }));
  const clicked = page.waitForEvent('console', { predicate: entry => entry.text() === 'field-clicked', timeout: 3000 });
  const filling = tryFastTextInput(page.locator('#name'), 'Test', page);
  await clicked;
  page._manualCaptchaPending = true;
  assert.equal(await filling, false);
  await humanType(page.locator('#name'), 'Test', page);
  assert.equal(await page.locator('#name').inputValue(), '');
  assert.equal(await humanClick(page, page.locator('#confirm')), false);
  assert.equal(await page.locator('#confirm').isChecked(), false);
  const select = page.locator('select');
  const selection = await selectOptionWithHumanInteraction({ page, field: select, candidates: ['B'] });
  assert.equal(selection.reason, 'manual_captcha_pending');
  assert.equal(await select.inputValue(), 'A');
  await page.locator('#confirm').click();
  assert.equal(await page.locator('#confirm').isChecked(), true);
});

test('tab phụ hết iframe ở mức 98% nhả quyền phục hồi và không F5 trang cha', { skip }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const realNow = Date.now.bind(Date);
  let elapsed = 0;
  t.mock.method(Date, 'now', () => realNow() + elapsed);
  for (const attachWatcher of [attachAutofillPageWatcher, attachOffer2615PageWatcher]) {
    const { context, page, session } = await createFormScopeFixture(browser, '<main><h2>98%</h2></main>');
    try {
      session.mainPage = await context.newPage();
      page._lateProgressRecoveryActive = true;
      let passes = 0;
      const logs = [];
      attachWatcher(page, {
        trackedPages: new WeakSet(), session, record: {}, options: { onLog: entry => logs.push(entry) },
        fillVisibleForms: async () => { passes++; }, checkLeadAfterEmailOnPage() {}, isSpamAdUrl: () => false, watchPage() {},
      });
      await waitForCondition(() => passes === 1);
      const [scan] = session._pageScans;
      elapsed += 65_000;
      await scan(true);
      assert.equal(page._lateProgressRecoveryActive, false);
      assert.equal(logs.some(entry => ['late_progress_reload', 'stuck_page_reload', 'late_progress_ai_requested'].includes(entry.type)), false);
    } finally { await context.close(); }
  }
});

test('form có script Cloudflare vẫn làm việc, lead đã có không chặn watchdog và iframe có AI fallback', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  await t.test('form thật không bị nhầm là challenge chỉ vì script hoặc widget nền', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<title>Application</title><script type="application/json" src="/cdn-cgi/challenge-platform/scripts/widget.js"></script><div id="cf-chl-widget">Captcha widget</div><form><label>First Name<input name="firstname" required></label></form>');
    try {
      assert.equal((await page.evaluate(inspectAutofillChallenge)).cf, false);
      await page.setContent('<title>Just a moment...</title><form id="challenge-form"><input name="challenge"></form>');
      assert.equal((await page.evaluate(inspectAutofillChallenge)).cf, true);
    } finally { await context.close(); }
  });
  await t.test('IP đã confirmed vẫn được điền và gọi fallback khi form trong iframe không tiến triển', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<iframe srcdoc="<form><label>Unknown required field<input required name=unknown></label></form>"></iframe>');
    try {
      const logs = [];
      let passes = 0, fallbackCalls = 0;
      const session = { slot: 2, exitIp: '192.0.2.99', confirmedLeadIp: '192.0.2.99', leadCheckStatus: 'checking' };
      attachAutofillPageWatcher(page, {
        trackedPages: new WeakSet(), session, record: {},
        options: { stuckThreshold: 1, libraryFirstPassDelayMs: 0, aiConfig: { enabled: false }, onStuck: () => { fallbackCalls++; }, onLog: entry => logs.push(entry) },
        fillVisibleForms: async () => { passes++; }, checkLeadAfterEmailOnPage() {}, isSpamAdUrl: () => false, watchPage() {},
      });
      await waitForCondition(() => fallbackCalls > 0 && logs.some(log => log.type === 'autofill_waiting'));
      assert.ok(passes > 0);
      assert.equal(session.leadCheckStatus, 'confirmed');
      assert.equal(session.screen5LeadVerified, true);
      assert.ok(logs.some(log => log.type === 'autofill_library_stalled'));
      assert.ok(!page.isClosed());
      const logged = logs.filter(log => log.type === 'autofill_library_stalled').length;
      session.triggerAutofillScan();
      await waitForCondition(() => fallbackCalls > 1);
      assert.equal(logs.filter(log => log.type === 'autofill_library_stalled').length, logged);
    } finally { await context.close(); }
  });
  await t.test('sửa field từ record trước khi gọi AI, không submit hoặc tạo dữ liệu mẫu', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<form onsubmit="event.preventDefault();this.dataset.sent=1"><input required name="firstname"><button disabled>Submit</button></form>');
    try {
      let fallbackCalls = 0;
      const session = { slot: 2, leadCheckStatus: 'confirmed' };
      const logs = [];
      blockAiForState(page, (await readVisiblePageState(page)).signature);
      attachAutofillPageWatcher(page, {
        trackedPages: new WeakSet(), session, record: { firstname: 'Ada' },
        options: { stuckThreshold: 1, libraryFirstPassDelayMs: 0, aiConfig: { enabled: false }, onStuck: () => { fallbackCalls++; }, onLog: entry => logs.push(entry) },
        fillVisibleForms: async () => {}, checkLeadAfterEmailOnPage() {}, isSpamAdUrl: () => false, watchPage() {},
      });
      await waitForCondition(() => logs.some(log => log.type === 'autofill_local_repair'));
      assert.equal(await page.locator('input').inputValue(), 'Ada');
      assert.equal(await page.locator('form').getAttribute('data-sent'), null);
      assert.equal(fallbackCalls, 0);
      assert.ok(!page._aiFormFixing);
    } finally { await context.close(); }
  });
  await t.test('trang chưa có control không quét liên tục; DOMContentLoaded đánh thức ngay dù đang backoff', async () => {
    const { context, page } = await createFormScopeFixture(browser, '<p>Waiting for form</p>');
    try {
      let passes = 0;
      attachAutofillPageWatcher(page, {
        trackedPages: new WeakSet(), session: {}, record: {}, options: { aiConfig: { enabled: false } },
        fillVisibleForms: async () => { passes++; }, checkLeadAfterEmailOnPage() {}, isSpamAdUrl: () => false, watchPage() {},
      });
      await waitForCondition(() => passes === 1);
      await page.waitForTimeout(1150);
      assert.equal(passes, 1);
      await page.setContent('<form><input name="firstname"></form>');
      await waitForCondition(() => passes > 1);
    } finally { await context.close(); }
  });
});


test('form đặc thù bỏ qua ô khóa và tiếp tục điền ô hoạt động, không nhận giá trị bị website xóa', { skip, timeout: 10000 }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, `<form>
    <input id="address" disabled><input id="date" readonly>
    <input id="phone" disabled><input id="city">
    <input id="zipcode" oninput="this.value=''">
    <div id="ai-disclaimer-container"><input type="checkbox" disabled></div>
  </form>`);
  try {
    const record = { address: '123 Main St', dob: '1990-08-15', phone: '2025550100', city: 'Boston', zipcode: '02108' };
    const filled = await fillAlphaIntentSpecialFields(page, record);
    assert.equal(filled, 1);
    assert.equal(await page.locator('#city').inputValue(), 'Boston');
    for (const selector of ['#address', '#date', '#phone', '#zipcode']) {
      assert.equal(await page.locator(selector).inputValue(), '');
      assert.equal(await page.locator(selector).getAttribute('data-ux-filled'), null);
    }
    assert.equal(await page.locator('input[type=checkbox]').isChecked(), false);
    assert.equal(await fillAlphaIntentSpecialFields(page, record), 0);
    await page.locator('#address').evaluate(element => { element.disabled = false; });
    assert.ok(await fillAlphaIntentSpecialFields(page, record) > 0);
    assert.equal(await page.locator('#address').inputValue(), '123 Main St');
  } finally { await context.close(); }
});
