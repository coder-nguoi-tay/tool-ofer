import { syncUplevelRewardsFields } from '../src/autofill/sync-uplevel-rewards-fields.mjs';
import { attachAutofill } from '../src/autofill/attach-autofill.mjs';
import { handleCheckboxField } from '../src/autofill/handle-checkbox-field.mjs';
import { humanType } from '../src/autofill/human-type.mjs';
import { tryFastTextInput } from '../src/autofill/interaction/try-fast-text-input.mjs';
import { renderBrowserMousePointer } from '../src/autofill/interaction/render-browser-mouse-pointer.mjs';
import { clickReadyControl } from '../src/browser/locators/click-ready-control.mjs';
import { fillAlphaIntentSpecialFields } from '../src/autofill/fill-alpha-intent-special-fields.mjs';
import { fillSelectOrTextField } from '../src/autofill/fill-select-or-text-field.mjs';
import { executeAction } from '../src/ai-assist/execute-action.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { configurePageMousePolicy } from '../src/autofill/interaction/configure-page-mouse-policy.mjs';
import { shouldAnimatePageMouse } from '../src/autofill/interaction/should-animate-page-mouse.mjs';
import { humanMouseMove } from '../src/autofill/human-mouse-move.mjs';
import { humanClick } from '../src/autofill/human-click.mjs';
import { naturalMouseDrift } from '../src/autofill/natural-mouse-drift.mjs';
import { humanWheelScroll } from '../src/autofill/human-wheel-scroll.mjs';
import { fillPageForms } from '../src/autofill/fill-page-forms.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';

test('mọi slot và popup giữ chuyển động chuột riêng', () => {
  const firstPage = {}, secondPage = {}, popup = {}, replacement = {};
  configurePageMousePolicy(firstPage, { slot: 1 });
  configurePageMousePolicy(secondPage, { slot: 2, tileIndex: 0 });
  configurePageMousePolicy(popup, { slot: 2 });
  configurePageMousePolicy(replacement, { tileIndex: 0 });
  assert.equal(shouldAnimatePageMouse(firstPage), true);
  assert.equal(shouldAnimatePageMouse(secondPage), true);
  assert.equal(shouldAnimatePageMouse(popup), true);
  assert.equal(shouldAnimatePageMouse(replacement), true);
  configurePageMousePolicy(secondPage, {});
  assert.equal(shouldAnimatePageMouse(secondPage), true);
  assert.equal(shouldAnimatePageMouse({}), true, 'API độc lập chưa có phiên giữ tương thích');
});

test('slot nào cũng chạy rê chuột, drift và wheel với vị trí riêng', async () => {
  const calls = [];
  const page = { mouse: { move: async () => calls.push('move'), wheel: async () => calls.push('wheel') } };
  configurePageMousePolicy(page, { slot: 3 });
  await humanMouseMove(page, 200, 100);
  await naturalMouseDrift(page);
  await humanWheelScroll(page);
  assert.ok(calls.includes('move'));
  assert.ok(calls.includes('wheel'));
  assert.ok(page._lastMousePos);
});

const skip = !existsSync(chromium.executablePath()) && 'Chưa cài Chromium của Playwright';
test('mọi màn hình đều thao tác thành công và có con trỏ chuột mô phỏng riêng', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const slot of [1, 2]) await t.test(`slot ${slot}`, async () => {
    const { context, page, session } = await createFormScopeFixture(browser, '<form><label>First Name<input name="firstname"></label><button type="button" id="choice" onclick="this.setAttribute(\'aria-pressed\',\'true\')">Choose</button></form>');
    try {
      session.slot = slot;
      let mouseMoves = 0;
      const originalMove = page.mouse.move.bind(page.mouse);
      page.mouse.move = async (...args) => { mouseMoves++; return originalMove(...args); };
      await fillPageForms(page, { session, sessionRecord: { firstname: 'Ada' }, options: { autoSubmit: false, simulateTypo: false }, triggerLeadCheckAfterEmail() {} });
      assert.equal(await page.locator('input').inputValue(), 'Ada');
      const movesBeforeClick = mouseMoves;
      assert.equal(await humanClick(page, page.locator('#choice')), true);
      assert.equal(await page.locator('#choice').getAttribute('aria-pressed'), 'true');
      assert.ok(mouseMoves > movesBeforeClick);
      assert.ok(mouseMoves > 1);
      assert.equal(await page.locator('[data-autoleadpc-mouse-pointer]').count(), 1);
      const pointer = page.locator('[data-autoleadpc-mouse-pointer]');
      assert.equal(await pointer.getAttribute('data-pressed'), '0');
      assert.equal(await pointer.isVisible(), true);
      assert.equal(await pointer.evaluate(element => getComputedStyle(element).pointerEvents), 'none');
      await page.reload();
      assert.equal(shouldAnimatePageMouse(page), true);
    } finally {
      await context.close();
    }
  });
});


test('renderer treo không chặn click và không tích lũy lệnh vẽ con trỏ', { timeout: 2500 }, async () => {
  let renders = 0, presses = 0, finishRender;
  const pendingRender = new Promise(resolve => { finishRender = resolve; });
  const page = {
    evaluate: () => { renders++; return pendingRender; },
    mouse: { move: async () => {}, down: async () => { presses++; }, up: async () => {} },
  };
  try {
    await humanMouseMove(page, 240, 160);
    assert.equal(await humanClick(page, {
      evaluate: async () => ({ ready: true }),
      boundingBox: async () => ({ x: 200, y: 120, width: 100, height: 40 }),
    }), true);
    assert.equal(presses, 1);
    assert.equal(renders, 1, 'Không xếp thêm lệnh DOM khi renderer chưa trả lời');
  } finally { finishRender(); }
  await new Promise(resolve => setImmediate(resolve));
  page.evaluate = async () => { renders++; };
  await renderBrowserMousePointer(page, 240, 160);
  assert.equal(renders, 2, 'Tiếp tục hiển thị khi renderer đã phản hồi');
});

test('nhãn checkbox, AI và field đặc thù trong iframe đều nhận chuột trên nhiều slot', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const slot of [1, 4]) await t.test(`slot ${slot}`, async () => {
    const { context, page } = await createFormScopeFixture(browser, `<iframe style="width:800px;height:600px" srcdoc='<form id="ai-funnel"><input id="name" data-testid="fullname-input"><input id="city"><input type="date" id="dob"><label id="agree-label" for="agree">Agree</label><input type="checkbox" id="agree" style="display:none"><label id="ai-label" for="ai-check">AI check</label><input type="checkbox" id="ai-check" style="display:none"><button type="button" id="answer">Answer</button><select id="state"><option value="">Choose</option><option value="MA">MA</option></select></form>'></iframe>`);
    try {
      configurePageMousePolicy(page, { slot });
      const frame = page.frames().find(candidate => candidate !== page.mainFrame());
      await frame.evaluate(() => {
        window.mouseTargets = [];
        document.querySelector('#answer').addEventListener('click', event => event.currentTarget.setAttribute('aria-pressed', 'true'));
        document.addEventListener('mousedown', event => window.mouseTargets.push(event.target.id), true);
      });
      assert.equal(await clickReadyControl(frame.locator('#agree'), { ready: true, useLabel: true }), true);
      assert.equal(await frame.locator('#agree').isChecked(), true);
      assert.equal((await executeAction(page, { action: 'check', selector: '#ai-check' })).verified, true);
      assert.equal((await executeAction(page, { action: 'click', selector: '#answer' })).ok, true);
      assert.equal(await frame.locator('#answer').getAttribute('aria-pressed'), 'true');
      await fillAlphaIntentSpecialFields(frame, { firstname: 'Ada', lastname: 'Lovelace', city: 'Boston' });
      assert.equal(await frame.locator('#name').inputValue(), 'Ada Lovelace');
      assert.equal(await frame.locator('#city').inputValue(), 'Boston');
      await fillSelectOrTextField({ metadata: { type: 'date', id: 'dob', names: ['dob'] }, field: frame.locator('#dob'), page, frame, valueToFill: '1990-08-15', options: {}, session: {}, frameProgress: { filledInThisPass: 0 }, unmatchedFieldNames: new Set(), record: {} });
      assert.equal(await frame.locator('#dob').inputValue(), '1990-08-15');
      await frame.locator('#answer').evaluate(element => element.removeAttribute('aria-pressed'));
      assert.equal((await executeAction(page, { action: 'click', selector: '#answer' })).ok, true);
      assert.equal(await frame.locator('#answer').getAttribute('aria-pressed'), 'true', 'Click sau ô ngày vẫn tới đúng đáp án');
      assert.equal((await executeAction(page, { action: 'select', selector: '#state', value: 'MA' })).verified, true);
      await frame.locator('#answer').evaluate(element => element.removeAttribute('aria-pressed'));
      assert.equal((await executeAction(page, { action: 'click', selector: '#answer' })).ok, true);
      assert.equal(await frame.locator('#answer').getAttribute('aria-pressed'), 'true', 'Click sau select vẫn tới đúng đáp án');
      const targets = await frame.evaluate(() => window.mouseTargets);
      for (const target of ['agree-label', 'ai-label', 'answer', 'name', 'city', 'dob', 'state']) assert.ok(targets.includes(target), `Thiếu mouse down tại ${target}`);
      assert.ok(page._lastMousePos);
      assert.equal(await page.locator('[data-autoleadpc-mouse-pointer]').count(), 1);
    } finally { await context.close(); }
  });
});


test('input không nhận click thì không được điền nhanh hoặc gõ phím', async () => {
  let writes = 0;
  const field = {
    evaluate: async () => ({ ready: false }),
    boundingBox: async () => ({ x: 0, y: 0, width: 100, height: 30 }),
    fill: async () => { writes++; }, inputValue: async () => '',
  };
  for (const slot of [1, 3]) {
    const page = { mouse: { move: async () => {} }, keyboard: { type: async () => { writes++; } } };
    configurePageMousePolicy(page, { slot });
    await humanType(field, 'Ada', page);
    assert.equal(await tryFastTextInput(field, 'Ada', page), false);
  }
  assert.equal(writes, 0);
});


test('checkbox bị overlay chặn không được ép checked hoặc tính đã điền', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<form><label><input id="terms" name="terms" type="checkbox" required>I agree to terms</label></form><div style="position:fixed;inset:0;z-index:1000"></div>');
  try {
    const session = {}, frameProgress = { filledInThisPass: 0 };
    await handleCheckboxField({ metadata: { type: 'checkbox', id: 'terms', names: ['I agree to terms'] }, scanProgress: { visibleFieldCount: 0 }, field: page.locator('#terms'), page, frame: page.mainFrame(), session, frameProgress, options: {} });
    assert.equal(await page.locator('#terms').isChecked(), false);
    assert.equal(await page.locator('#terms').getAttribute('data-ux-filled'), null);
    assert.equal(frameProgress.filledInThisPass, 0);
    assert.equal(session.autofillFields || 0, 0);
  } finally { await context.close(); }
});


test('con trỏ hiện trước thao tác, tự trở lại sau reload/popup và không bị CSS của offer che', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<style>div,svg{display:none!important}[data-autoleadpc-mouse-pointer]{display:none!important;opacity:0!important;visibility:hidden!important}</style><form><input name="firstname"></form>');
  try {
    attachAutofill(context, [], 'https://form-scope.test', { slot: 4 }, { offerStrategy: { mode: 'manual' } });
    const pointer = page.locator('[data-autoleadpc-mouse-pointer]');
    await pointer.waitFor({ state: 'visible', timeout: 2000 });
    assert.equal(await pointer.count(), 1);
    assert.equal(await page.locator('input').inputValue(), '', 'Hiển thị con trỏ không tự điền form thủ công');
    assert.equal(await pointer.evaluate(element => getComputedStyle(element).opacity), '1');
    assert.equal(await pointer.evaluate(element => getComputedStyle(element).pointerEvents), 'none');
    assert.equal(await pointer.evaluate(element => getComputedStyle(element.shadowRoot.querySelector('svg')).display), 'inline');
    await page.reload();
    await pointer.waitFor({ state: 'visible', timeout: 2000 });
    await pointer.evaluate(element => element.remove());
    await pointer.waitFor({ state: 'visible', timeout: 2000 });
    assert.equal(await pointer.count(), 1);
    await page.evaluate(() => { document.body.innerHTML = '<p>Step 2</p>'; });
    assert.equal(await pointer.isVisible(), true);
    const popup = await context.newPage();
    await popup.goto('https://form-scope.test/popup');
    await popup.locator('[data-autoleadpc-mouse-pointer]').waitFor({ state: 'visible', timeout: 2000 });
    assert.equal(popup._autofillMouseSlot, 4);
    assert.equal(await popup.locator('[data-autoleadpc-mouse-pointer]').count(), 1);
  } finally { await context.close(); }
});


test('điền tuần tự Alpha/Uplevel: mỗi ô nhận click trước input và giữ nhịp trước ô kế tiếp', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const record = { email: 'ada@example.invalid', firstname: 'Ada', lastname: 'Lovelace', address: '123 Main St', city: 'Boston', zipcode: '02108', state: 'MA', phone: '2025550100' };
  for (const variant of ['Alpha', 'Uplevel']) await t.test(variant, async () => {
    const html = variant === 'Alpha'
      ? '<form><input id="address" value="123 Main St"><input id="city"><input id="zipcode"></form>'
      : '<form id="reg-container"><input id="em"><input id="fn"><input id="zp"><select id="state"><option value="">Choose</option><option value="MA">MA</option></select><input id="ct"><input id="tl"><input type="hidden" name="telephone"></form>';
    const { context, page } = await createFormScopeFixture(browser, html);
    try {
      configurePageMousePolicy(page, { slot: 4 });
      await page.evaluate(() => {
        window.inputTimeline = [];
        for (const type of ['mousedown', 'input']) document.addEventListener(type, event => {
          if (event.target.matches('input:not([type="hidden"]),select')) window.inputTimeline.push({ type, field: event.target.id, time: performance.now() });
        }, true);
      });
      if (variant === 'Alpha') await fillAlphaIntentSpecialFields(page.mainFrame(), record);
      else await syncUplevelRewardsFields(page.mainFrame(), record);
      const timeline = await page.evaluate(() => window.inputTimeline);
      const fields = variant === 'Alpha' ? ['city', 'zipcode'] : ['em', 'fn', 'zp', 'state', 'ct', 'tl'];
      let previousInputTime = 0;
      for (const field of fields) {
        const click = timeline.find(event => event.type === 'mousedown' && event.field === field);
        const input = timeline.find(event => event.type === 'input' && event.field === field);
        assert.ok(click && input, `Ô ${field} phải có cả click và input`);
        assert.ok(input.time - click.time >= 140, `Ô ${field} cần chờ sau khi click`);
        if (previousInputTime) assert.ok(click.time - previousInputTime >= 140, 'Không chuyển chuột sang ô sau quá sớm');
        previousInputTime = input.time;
      }
      if (variant === 'Uplevel') assert.equal(await page.locator('input[name="telephone"]').inputValue(), '2025550100');
    } finally { await context.close(); }
  });
});
