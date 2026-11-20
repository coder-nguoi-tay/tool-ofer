import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { fillSelectOrTextField } from '../src/autofill/fill-select-or-text-field.mjs';
import { recordPageDialog } from '../src/autofill/record-page-dialog.mjs';
import { createFormScopeFixture } from './helpers/form-scope-browser-fixture.mjs';
import { matchFieldValue } from '../src/autofill/match-field-value.mjs';
import { matchFieldValue as matchSeparateProfileField } from '../src/autofill/offers/2615/solver/match-field-value.mjs';
import { resolveProvidedFieldValue } from '../src/autofill/record-values/resolve-provided-field-value.mjs';
import { parseAutofillRecords } from '../src/autofill/parse-autofill-records.mjs';

test('các đường đọc hồ sơ từ chối ô định danh mơ hồ, mã xác minh và thông tin người khác', () => {
  const profile = { ssn: '000-00-4321', firstname: 'Fixture', dob: '1994-03-09', phone: '2025550147' };
  const [suffixOnly] = parseAutofillRecords('ssn_last4\n4321');
  const [invalidSuffix] = parseAutofillRecords('ssn_last4\nTEST-4321');
  for (const [label, name, record] of [
    ['Last 4', 'last4', profile], ['Card last 4 digits', 'last4', profile],
    ['Account last 4 digits', 'last4', suffixOnly], ['Security', 'security', { socialsecurity: profile.ssn }],
    ['Company registration number', 'ssn', profile], ['Last 4 digits of Social Security number', 'ssn_last4', profile],
    ['Last 4 digits of SSN', 'ssn_last4', invalidSuffix], ['Last 4 digits of SSN', 'ssn_last4', { ssn_last4: 'TEST-CODE' }],
    ['Phone verification code', 'phone', profile], ['Code we sent to your phone', 'phone', profile],
    ['Enter OTP here', 'phone', profile], ['Mã xác minh', 'phone', profile], ['Emergency contact first name', 'firstname', profile],
    ['Child date of birth', 'dob', profile], ['Ngày sinh của con', 'dob', profile],
  ]) {
    const field = { label, accessibleName: label, name, names: [name, label], type: 'text' };
    for (const match of [matchFieldValue, matchSeparateProfileField]) {
      assert.equal(match(field.names, record, field), null, label);
      assert.equal(match(field.names, record, { ...field, maxLength: 4 }), null, label);
    }
    assert.equal(resolveProvidedFieldValue(field, record), null, label);
  }
  assert.equal(matchFieldValue(['ssn_last4', 'last4'], profile), '4321');
  assert.equal(matchFieldValue(['ssn'], profile, { label: 'SSN', maxLength: 4 }), null);
  assert.equal(matchFieldValue(['phone'], profile, { label: 'Phone', type: 'tel' }), profile.phone);
});

test('giá trị có sẵn của ô cần xác minh hoặc thuộc người khác không bị ghi đè', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<input id="code" value="keep"><input id="last4" value="keep"><input id="dob" type="date" value="2001-10-01">');
  const { collectFieldMetadata } = await import('../src/autofill/collect-field-metadata.mjs');
  for (const [id, label, proposed] of [
    ['code', 'Phone verification code', '2025550147'], ['last4', 'Card last 4 digits', '4321'], ['dob', 'Child date of birth', '1994-03-09'],
  ]) {
    const field = page.locator('#' + id);
    await field.evaluate((input, text) => input.setAttribute('aria-label', text), label);
    const metadata = await field.evaluate(collectFieldMetadata);
    const original = await field.inputValue();
    const skipped = await fillSelectOrTextField({ metadata, field, page, valueToFill: proposed, options: {}, record: {} });
    assert.equal(skipped, true);
    assert.equal(await field.inputValue(), original);
    assert.equal(await field.getAttribute('data-ux-filled'), null);
  }
});

test('giữ nguyên dữ liệu khi ô quá ngắn hoặc ngày đề xuất không hợp lệ', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<form><input id="phone" type="tel" maxlength="7" value="123"><input id="zipcode" maxlength="5" value="01234"><input type="date" id="dob" min="1990-01-01" value="1994-03-09"></form>');
  t.after(() => context.close());
  for (const [id, original, proposed] of [
    ['phone', '123', '2025550147'], ['zipcode', '01234', '01234-5678'],
    ['dob', '1994-03-09', '1994-02-31'], ['dob', '1994-03-09', '1994'], ['dob', '1994-03-09', '1989-03-09'],
  ]) {
    const field = page.locator('#' + id);
    const metadata = { id, type: await field.getAttribute('type') || 'text', names: [id], maxLength: await field.evaluate(el => el.maxLength) };
    const skipped = await fillSelectOrTextField({ metadata, field, page, frame: page, valueToFill: proposed, options: {}, session: {}, frameProgress: {}, unmatchedFieldNames: new Set(), record: {} });
    assert.equal(skipped, true);
    assert.equal(await field.inputValue(), original);
    assert.equal(await field.getAttribute('data-ux-filled'), null);
  }
});

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
