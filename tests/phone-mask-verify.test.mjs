import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { fillSelectOrTextField } from '../src/autofill/fill-select-or-text-field.mjs';
import { recordPageDialog } from '../src/autofill/record-page-dialog.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';

test('alert lỗi nhập liệu của script.js financialhelpfinder được nhận diện', () => {
  for (const message of ['Please make a selection for Gender', 'Please check the Terms of Service box', 'You need to be over 18 years of age to continue', 'You must be 18 years of age or older']) {
    const page = {};
    recordPageDialog(page, { message: () => message, type: () => 'alert' });
    assert.equal(page._uxLastDialog.validation, true, message);
  }
});

test('ô phone có mask (814-362-6091) được coi là đã điền đúng, không gõ lại 3 lần', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, `<form><input id="phone" name="phone" type="tel" oninput="const d=this.value.replace(/\\D/g,'').slice(0,10);this.value=d.replace(/(\\d{3})(\\d{0,3})(\\d{0,4})/,(m,a,b,c)=>[a,b,c].filter(Boolean).join('-'));window.typed=(window.typed||0)+1"></form>`);
  t.after(() => context.close());
  const logs = [];
  await fillSelectOrTextField({ metadata: { type: 'tel', id: 'phone', names: ['phone'] }, field: page.locator('#phone'), page, frame: page, valueToFill: '8143626091', options: { onLog: entry => logs.push(entry) }, session: {}, frameProgress: { filledInThisPass: 0 }, unmatchedFieldNames: new Set(), record: {} });
  assert.equal(await page.inputValue('#phone'), '814-362-6091');
  assert.equal(logs.filter(entry => entry.type === 'field_fill_verify_failed').length, 0, 'không báo verify thất bại');
  const typed = await page.evaluate(() => window.typed);
  assert.ok(typed <= 16, `không gõ lại nhiều lần (${typed} sự kiện input)`);
});
