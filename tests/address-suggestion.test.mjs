import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { chromium } from 'playwright';
import { selectFirstAddressSuggestion } from '../src/autofill/select-first-address-suggestion.mjs';
import { hasActiveAddressSuggestions } from '../src/autofill/has-active-address-suggestions.mjs';
import { handleAddressSelectDropdown } from '../src/autofill/handle-address-select-dropdown.mjs';
import { resolveActiveFormScope } from '../src/autofill/form-scope/resolve-active-form-scope.mjs';
import { selectFirstAddressSuggestion as selectOfferAddress } from '../src/autofill/offers/2615/solver/select-first-address-suggestion.mjs';

test('địa chỉ: thiếu scope, frame con chưa đọc được thì dừng trước khi dò trang cha', async () => {
  const parent = { evaluate: () => assert.fail('Không tra cứu trang cha') };
  const frame = { evaluate: () => assert.fail('Thiếu scope đã xác minh') };
  assert.equal(await hasActiveAddressSuggestions(parent, frame), false);
  assert.equal(await selectFirstAddressSuggestion(parent, frame), false);
  assert.deepEqual(await handleAddressSelectDropdown(frame, { address: '10 Oak St' }), { success: false });
});

test('địa chỉ: kiểm tra gợi ý trong Chromium cục bộ', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.abort());
  const suggestions = '<div role="listbox" id="results"><div role="option" onmousedown="this.dataset.clicks=Number(this.dataset.clicks||0)+1" onclick="this.dataset.clicks=Number(this.dataset.clicks||0)+1">10 Oak St</div></div>';
  const field = '<input name="address" value="10 Oak St" aria-controls="results">';

  await t.test('chỉ chọn một lần trong danh sách ARIA do ô nhập sở hữu', async () => {
    await page.setContent('<form>' + field + '</form>' + suggestions + '<div role="listbox"><div role="option" onclick="this.dataset.wrong=1">10 Oak St</div></div>');
    await resolveActiveFormScope(page);
    const input = page.locator('input');
    assert.equal(await hasActiveAddressSuggestions(page, page, input), true);
    assert.equal(await selectFirstAddressSuggestion(page, page, input), true);
    assert.equal(await page.locator('#results [role=option]').getAttribute('data-clicks'), '1');
    assert.equal(await page.locator('[data-wrong]').count(), 0);
  });

  await t.test('từ chối footer kể cả khi có aria-controls, rồi từ chối portal đã mất quan hệ sở hữu', async () => {
    await page.setContent('<form>' + field + '</form><footer>' + suggestions + '</footer>');
    await resolveActiveFormScope(page);
    assert.equal(await hasActiveAddressSuggestions(page, page), false);
    assert.equal(await selectOfferAddress(page, page), false);
    await page.evaluate(() => {
      document.body.append(document.querySelector('#results'));
      document.querySelector('input').removeAttribute('aria-controls');
    });
    assert.equal(await selectFirstAddressSuggestion(page, page), false);
    assert.equal(await page.locator('[data-clicks]').count(), 0);
  });

  await t.test('iframe không được dùng danh sách trang cha hay locator của form khác', async () => {
    await page.setContent('<form>' + field + '</form>' + suggestions + '<iframe></iframe>');
    await resolveActiveFormScope(page);
    const child = page.frames().find(frame => frame !== page.mainFrame());
    await child.setContent('<form>' + field + '</form>');
    await resolveActiveFormScope(child);
    assert.equal(await hasActiveAddressSuggestions(page, child), false);
    assert.equal(await selectFirstAddressSuggestion(page, child, page.locator('input')), false);
    assert.equal(await selectFirstAddressSuggestion(page, child), false);
    assert.equal(await page.locator('[data-clicks]').count(), 0);
  });

  await t.test('từ chối menu thuộc một form khác hoặc đồng thời được hai ô nhận là của mình', async () => {
    await page.setContent('<form id="current">' + field + '</form><form id="other">' + field + '</form>' + suggestions);
    const input = page.locator('#current input');
    await input.focus();
    await resolveActiveFormScope(page);
    assert.equal(await selectFirstAddressSuggestion(page, page, input), false);
    assert.equal(await selectFirstAddressSuggestion(page, page, page.locator('#other input')), false);
    assert.equal(await page.locator('[data-clicks]').count(), 0);
  });

  await t.test('select chỉ đổi khi đúng form, đúng địa chỉ và có một lựa chọn khớp', async () => {
    const select = '<select name="verified_address"><option value="">Choose</option><option value="a">110 Oak St</option><option value="b">10 Oak St</option></select>';
    await page.setContent('<form id="active"><input name="address" value="10 Oak St">' + select + '</form><footer><form>' + select + '</form></footer>');
    const input = page.locator('#active input');
    await input.focus();
    await resolveActiveFormScope(page);
    assert.equal((await handleAddressSelectDropdown(page, { address: 'Unknown' }, input)).success, false);
    assert.equal((await handleAddressSelectDropdown(page, { address: '10 Oak St' }, input)).success, true);
    assert.equal(await page.locator('#active select').inputValue(), 'b');
    assert.equal(await page.locator('footer select').inputValue(), '');
    await page.locator('#active select').evaluate(select => {
      select.add(new Option('10 Oak St, unit B', 'c'));
      select.value = '';
    });
    assert.equal((await handleAddressSelectDropdown(page, { address: '10 Oak St' }, input)).success, false);
    assert.equal(await page.locator('#active select').inputValue(), '');
  });

  await t.test('từ chối link hoặc khi tâm mục gợi ý bị phần tử khác che', async () => {
    await page.setContent('<form>' + field + '</form><div id="results" role="listbox"><a role="option" href="/elsewhere">10 Oak St</a></div>');
    await resolveActiveFormScope(page);
    assert.equal(await selectFirstAddressSuggestion(page, page), false);
    await page.locator('#results').evaluate(list => {
      list.innerHTML = '<div role="option" onclick="this.dataset.clicks=1">10 Oak St</div>';
      const overlay = document.body.appendChild(document.createElement('div'));
      overlay.style.cssText = 'position:fixed;inset:0;z-index:5';
    });
    assert.equal(await selectFirstAddressSuggestion(page, page), false);
    assert.equal(await page.locator('[data-clicks]').count(), 0);
  });
});
