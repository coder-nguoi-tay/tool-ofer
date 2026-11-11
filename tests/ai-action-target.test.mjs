import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { executeAction } from '../src/ai-assist/execute-action.mjs';
import { normalizeElementSelector } from '../src/browser/locators/normalize-element-selector.mjs';
import { resolveActionTarget } from '../src/ai-assist/resolve-action-target.mjs';

test('chuẩn hóa id số, không thay nội dung thuộc tính hoặc CSS đã escape', () => {
  assert.equal(normalizeElementSelector('#3949'), '[id="3949"]');
  assert.equal(normalizeElementSelector('div #5420:checked'), 'div [id="5420"]:checked');
  assert.equal(normalizeElementSelector('[href="#3949"]'), '[href="#3949"]');
  assert.equal(normalizeElementSelector('button:has-text("#3949")'), 'button:has-text("#3949")');
  assert.equal(normalizeElementSelector('#\\33 949'), '#\\33 949');
});

test('action xác minh form/frame và trạng thái tương tác trước khi click', async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, `<div style="opacity:0"><button id="3949">Old</button></div>
  <div id="active"><button id="3949" onclick="this.dataset.clicked=1">Current</button><button id="disabled" disabled>Continue</button>
  <div style="visibility:hidden"><button id="hidden">Continue</button></div><div aria-busy="true"><button id="busy">Continue</button></div>
  <input name="email" id="email"><input id="readonly" readonly value="Kept"><label><input id="choice" type="checkbox" style="display:none">Choice</label></div><aside><button id="side">Continue</button></aside>`);
  t.after(() => context.close());
  page._activeAutofillFrame = page.mainFrame();
  page.mainFrame()._activeAutofillFormScope = { active: true, memberSelector: ':is(#active, #active *)', rootSelector: '#active' };

  await t.test('id số trùng: chỉ click node hiện tại và không báo selector_not_found', async () => {
    const result = await executeAction(page, { action: 'click', selector: '#3949' });
    assert.equal(result.ok, true);
    assert.equal(await page.locator('#active [id="3949"]').getAttribute('data-clicked'), '1');
    assert.equal(await page.locator('[id="3949"]').first().getAttribute('data-ux-clicked'), null);
  });
  await t.test('hidden/disabled/busy và nút ngoài form bị từ chối', async () => {
    for (const selector of ['#disabled', '#hidden', '#busy', '#side']) {
      const result = await executeAction(page, { action: 'click', selector });
      assert.equal(result.ok, false, selector);
      assert.equal(await page.locator(selector).getAttribute('data-ux-clicked'), null);
    }
    assert.equal((await resolveActionTarget(page, 'input[')).reason, 'invalid_selector');
  });
  await t.test('checkbox native ẩn có label hiển thị vẫn được check thật', async () => {
    const session = { autofillFields: 0 };
    const result = await executeAction(page, { action: 'check', selector: '#choice' }, session);
    assert.equal(result.ok, true);
    assert.equal(await page.locator('#choice').isChecked(), true);
    assert.equal(session.autofillFields, 1);
  });
  await t.test('selector marker vẫn nhận diện email thật và từ chối field chỉ đọc', async () => {
    const session = { assignedEmail: 'assigned@example.invalid', autofillFields: 0 };
    await page.locator('#email').evaluate(element => element.setAttribute('data-ux-ai-target', 'email-marker'));
    const result = await executeAction(page, { action: 'fill', selector: '[data-ux-ai-target="email-marker"]', value: 'other@example.invalid' }, session);
    assert.equal(result.ok, true);
    assert.equal(await page.locator('#email').inputValue(), session.assignedEmail);
    assert.equal((await executeAction(page, { action: 'fill', selector: '#readonly', value: 'Changed' })).reason, 'element_readonly');
    assert.equal(await page.locator('#readonly').inputValue(), 'Kept');
  });
  await t.test('tìm action trong iframe đang làm việc', async () => {
    await page.locator('body').evaluate(body => {
      const iframe = document.createElement('iframe'); iframe.srcdoc = '<button id="3949" onclick="this.dataset.clicked=1">Continue</button>'; body.append(iframe);
    });
    await page.waitForFunction(() => document.querySelector('iframe')?.contentDocument?.querySelector('button'));
    page._activeAutofillFrame = page.frames()[1];
    assert.equal((await executeAction(page, { action: 'click', selector: '#3949' })).ok, true);
    assert.equal(await page.frames()[1].locator('[id="3949"]').getAttribute('data-clicked'), '1');
  });
});

test('click thất bại không báo thành công hoặc fallback DOM click', async () => {
  let syntheticClicks = 0;
  const locator = { evaluate: async fn => fn.name === 'inspectInteractionReadiness' ? { ready: true } : syntheticClicks++, click: async () => { throw new Error('intercepted'); } };
  const page = { locator: () => ({ count: async () => 1, nth: () => locator }) };
  const result = await executeAction(page, { action: 'click', selector: '#next' });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'click_failed');
  assert.equal(syntheticClicks, 0);
});
