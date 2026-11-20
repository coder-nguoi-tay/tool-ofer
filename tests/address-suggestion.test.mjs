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
  const suggestions = '<div role="listbox" id="results"><div role="option" onmousedown="this.dataset.presses=Number(this.dataset.presses||0)+1" onclick="this.dataset.clicks=Number(this.dataset.clicks||0)+1">10 Oak St</div></div>';
  const field = '<input name="address" value="10 Oak St" aria-controls="results">';

  await t.test('chỉ chọn một lần trong danh sách ARIA do ô nhập sở hữu', async () => {
    await page.setContent('<form>' + field + '</form>' + suggestions + '<div role="listbox"><div role="option" onclick="this.dataset.wrong=1">10 Oak St</div></div>');
    await resolveActiveFormScope(page);
    const input = page.locator('input');
    assert.equal(await hasActiveAddressSuggestions(page, page, input), true);
    assert.equal(await selectFirstAddressSuggestion(page, page, input), true);
    assert.equal(await page.locator('#results [role=option]').getAttribute('data-presses'), '1');
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

  await t.test('select chọn lựa chọn đầu tiên khớp địa chỉ trong đúng form', async () => {
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
    assert.equal((await handleAddressSelectDropdown(page, { address: '10 Oak St' }, input)).success, true);
    assert.equal(await page.locator('#active select').inputValue(), 'b');
  });

  await t.test('giữ mục select người dùng chọn, kiểm tra lại khi record hoặc trạng thái hợp lệ thay đổi', async () => {
    const { readAddressSelection } = await import('../src/autofill/read-address-selection.mjs');
    await page.setContent(`<form><input name="address" value="10 North Oak Street" aria-controls="choices">
      <select id="choices" onchange="this.form.dataset.changes=Number(this.form.dataset.changes||0)+1">
        <option value="">Choose</option><option value="a">10 N Oak St Unit A</option><option value="b">10 N Oak St Unit B</option>
      </select></form>`);
    const input = page.locator('input');
    await page.locator('select').selectOption('b');
    await resolveActiveFormScope(page);
    assert.equal((await input.evaluate(readAddressSelection, '10 North Oak Street')).retained, true);
    assert.equal((await handleAddressSelectDropdown(page, { address: '10 North Oak Street' }, input)).success, true);
    assert.equal(await page.locator('select').inputValue(), 'b');
    assert.equal(await page.locator('form').getAttribute('data-changes'), '1');
    assert.equal((await input.evaluate(readAddressSelection, '110 North Oak Street')).retained, false);
    await input.evaluate(field => field.setAttribute('aria-invalid', 'true'));
    assert.equal((await input.evaluate(readAddressSelection, '10 North Oak Street')).retained, false);
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

test('chọn địa chỉ một lần, giữ mã của widget khi auto quét lại và khi gửi form', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { fillSelectOrTextField } = await import('../src/autofill/fill-select-or-text-field.mjs');
  const { submitFrameForm } = await import('../src/autofill/submit-frame-form.mjs');
  const { syncAlphaHiddenContactData } = await import('../src/autofill/alpha-intent/sync-alpha-hidden-contact-data.mjs');
  const { createFormScopeFixture } = await import('./helpers/form-scope-browser-fixture.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, `<form>
    <label>Street address<input id="address" name="address" aria-controls="addresses" value="10 Oak St"></label>
    <select name="verified_address" id="addresses"><option value="">Choose</option><option value="addr-10">10 Oak St, Unit A</option></select>
    <input type="hidden" id="input-address" readonly><button id="submit" disabled>Continue</button></form>`);
  await page.evaluate(() => {
    const form = document.querySelector('form'), street = form.elements.address, choices = form.elements.verified_address;
    const id = document.querySelector('#input-address'), submit = document.querySelector('#submit');
    choices.onchange = () => {
      form.dataset.choices = String(Number(form.dataset.choices || 0) + 1);
      street.value = '10 Oak Street, Unit A';
      id.value = choices.value;
      submit.disabled = false;
    };
    street.oninput = id.oninput = () => { id.value = ''; submit.disabled = true; form.dataset.overwritten = 'yes'; };
    form.onsubmit = event => { event.preventDefault(); form.dataset.submitted = id.value; };
  });
  const scope = await resolveActiveFormScope(page);
  const field = page.locator('#address'), record = { address: '10 Oak St' };
  assert.equal((await handleAddressSelectDropdown(page, record, field)).success, true);
  const frameProgress = { formScope: scope, filledInThisPass: 1 };
  for (let scan = 0; scan < 2; scan++) {
    await fillSelectOrTextField({ metadata: { names: ['address'], type: 'text', kind: 'input' }, field, page, frame: page,
      valueToFill: record.address, record, options: {}, session, frameProgress, unmatchedFieldNames: new Set() });
    await page.evaluate(syncAlphaHiddenContactData);
    await handleAddressSelectDropdown(page, record, field);
  }
  assert.equal(await field.inputValue(), '10 Oak Street, Unit A');
  assert.equal(await page.locator('#input-address').inputValue(), 'addr-10');
  assert.equal(await page.locator('#submit').isEnabled(), true);
  await submitFrameForm({ options: { autoSubmit: true }, frame: page, page, session, frameProgress, record, screenInfo: {}, scanStartUrl: page.url() });
  assert.deepEqual(await page.locator('form').evaluate(form => [form.dataset.choices, form.dataset.overwritten, form.dataset.submitted]), ['1',undefined,'addr-10']);
});

test('địa chỉ được widget xác nhận khi lấy focus vẫn giữ mã ở cả hai đường nhập', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { humanType } = await import('../src/autofill/human-type.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  for (const slot of [1, 2]) {
    await page.setContent(`<form><label>Street address<input name="address" role="combobox"
      onfocus="this.value='10 Oak Street, Unit A'; this.form.elements.place_id.value='fixture-id'"
      oninput="this.form.elements.place_id.value=''"></label><input type="hidden" name="place_id"></form>`);
    page._autofillMouseSlot = slot;
    const street = page.locator('[name=address]');
    await humanType(street, '10 Oak St', page, { address: true, simulateTypo: false });
    assert.equal(await street.inputValue(), '10 Oak Street, Unit A');
    assert.equal(await page.locator('[name=place_id]').inputValue(), 'fixture-id');
  }
});

test('widget xác nhận ngay khi nhập nhanh thì auto không phát lại input hoặc khôi phục chữ gốc', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { fillSelectOrTextField } = await import('../src/autofill/fill-select-or-text-field.mjs');
  const { createFormScopeFixture } = await import('./helpers/form-scope-browser-fixture.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, `<form>
    <label>Street address<input name="address" role="combobox"></label><input type="hidden" name="place_id">
    <button disabled>Continue</button></form>`);
  await page.evaluate(() => {
    const f = document.querySelector('form'), street = f.elements.address, place = f.elements.place_id;
    street.oninput = () => {
      if (f.dataset.accepted) { place.value = ''; f.querySelector('button').disabled = true; return; }
      if (street.value !== '10 Oak St') return;
      street.value = '10 Oak Street, Unit A';
      place.value = 'local-10'; f.dataset.accepted = 'yes'; f.querySelector('button').disabled = false;
    };
  });
  page._autofillMouseSlot = 2;
  const field = page.locator('[name=address]');
  await fillSelectOrTextField({ metadata: { names: ['address'], type: 'text', kind: 'input' }, field, page, frame: page,
    valueToFill: '10 Oak St', record: { address: '10 Oak St' }, options: {}, session, frameProgress: {}, unmatchedFieldNames: new Set() });
  assert.equal(await field.inputValue(), '10 Oak Street, Unit A');
  assert.equal(await page.locator('[name=place_id]').inputValue(), 'local-10');
  assert.equal(await page.locator('button').isEnabled(), true);
});

test('agent giữ lựa chọn ARIA đã có trước lần quét đầu kể cả khi widget không có place_id', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { applyRecordFormField } = await import('../src/form-mcp/apply-record-form-field.mjs');
  const { createFormScopeFixture } = await import('./helpers/form-scope-browser-fixture.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page } = await createFormScopeFixture(browser, `<form data-autoleadpc-mcp="record">
    <input data-autoleadpc-field="address" role="combobox" aria-expanded="false" aria-controls="locations" value="10 Oak Street, Unit A">
    <div role="listbox" id="locations" hidden><div role="option" aria-selected="true">10 Oak St, Unit A</div></div></form>`);
  const form = await page.locator('form').elementHandle();
  try {
    const operation = { origin: new URL(page.url()).origin, field: 'address', value: '10 Oak St', requireSingle: true };
    assert.deepEqual(await applyRecordFormField(form, operation), { verified: true, changed: false });
    assert.equal(await page.locator('input').inputValue(), '10 Oak Street, Unit A');
  } finally { await form.dispose(); }
});

test('địa chỉ chưa xác nhận chặn cả nút và đường gửi dự phòng, select mặc định phát change đúng một lần', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { createFormScopeFixture } = await import('./helpers/form-scope-browser-fixture.mjs');
  const { submitFrameForm } = await import('../src/autofill/submit-frame-form.mjs');
  const { submitFrameForm: submitOffer } = await import('../src/autofill/offers/2615/solver/submit-frame-form.mjs');
  const { readAddressSelection } = await import('../src/autofill/read-address-selection.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, '<form></form>');
  const record = { address: '10 Oak St' };
  for (const submit of [submitFrameForm, submitOffer]) {
    for (const button of ['', '<button>Continue</button>']) {
      await page.setContent(`<form onsubmit="event.preventDefault();this.dataset.submitted=1">
        <label>Street address<input required aria-controls="choices" name="address" value="10 Oak St"></label>
        <div role="listbox" id="choices"><div role="option">10 Oak St Unit A</div><div role="option">10 Oak St Unit B</div></div>${button}</form>`);
      const scope = await resolveActiveFormScope(page);
      await submit({ options: {}, frame: page, page, session, record, frameProgress: { formScope: scope, filledInThisPass: 1 },
        screenInfo: {}, scanStartUrl: page.url() });
      assert.equal(await page.locator('form').getAttribute('data-submitted'), null);
    }
  }
  await page.setContent(`<form><input name="address" aria-controls="choices" value="10 Oak St">
    <select id="choices" name="verified_address" onchange="this.form.dataset.changes=Number(this.form.dataset.changes||0)+1"><option value="id10">10 Oak St</option></select>
    <input type="hidden" name="place_id"></form>`);
  const input = page.locator('input[name=address]');
  await resolveActiveFormScope(page);
  assert.equal((await input.evaluate(readAddressSelection, record.address)).retained, false);
  for (let scan = 0; scan < 2; scan++) {
    assert.equal((await handleAddressSelectDropdown(page, record, input)).success, false);
  }
  assert.equal(await page.locator('form').getAttribute('data-changes'), '1');
  await page.locator('[name=place_id]').evaluate(token => { token.value = 'id10'; });
  assert.equal((await input.evaluate(readAddressSelection, record.address)).retained, true);
});

test('gương chữ địa chỉ đồng bộ lại một lần, mã của widget chỉ do form ghi', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { createFormScopeFixture } = await import('./helpers/form-scope-browser-fixture.mjs');
  const { syncAlphaContactLocation } = await import('../src/autofill/alpha-intent/sync-alpha-contact-location.mjs');
  const { syncAlphaHiddenContactData } = await import('../src/autofill/alpha-intent/sync-alpha-hidden-contact-data.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page } = await createFormScopeFixture(browser, '<form><input id="address" value="99 Pine Rd"><input readonly type="hidden" id="input-address" value="10 Oak St" onchange="this.dataset.changes=Number(this.dataset.changes||0)+1"></form>');
  await page.evaluate(syncAlphaContactLocation, {});
  await page.evaluate(syncAlphaHiddenContactData);
  assert.equal(await page.locator('#input-address').inputValue(), '99 Pine Rd');
  assert.equal(await page.locator('#input-address').getAttribute('data-changes'), '1');
  await page.locator('#input-address').evaluate(token => { token.name = 'place_id'; token.value = 'widget-token'; });
  await page.evaluate(syncAlphaContactLocation, {});
  await page.evaluate(syncAlphaHiddenContactData);
  assert.equal(await page.locator('#input-address').inputValue(), 'widget-token');
});

test('menu của ô mang nhãn điện thoại không được dùng như danh sách địa chỉ dù name là address', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<form><label>Phone number<input name="address" aria-controls="list" value="10 Oak St"></label><div id="list" role="listbox"><div role="option" onclick="this.dataset.clicked=1">10 Oak St</div></div></form>');
  await resolveActiveFormScope(page);
  assert.equal(await hasActiveAddressSuggestions(page, page), false);
  assert.equal(await selectFirstAddressSuggestion(page, page, page.locator('input')), false);
  assert.equal(await page.locator('[data-clicked]').count(), 0);
});

test('Mailing Address qua toàn bộ lượt quét: giữ nguyên truy vấn đến khi form xác nhận', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { fillPageForms } = await import('../src/autofill/fill-page-forms.mjs');
  const { createFormScopeFixture } = await import('./helpers/form-scope-browser-fixture.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, `<form data-object-type="form" data-tf-element-role="offer">
    <label for="address">Mailing Address</label>
    <input id="address" name="address" data-type="address" data-populated="false" required placeholder="Street Address, City, State">
    <div class="address-suggestions"></div><button disabled>Continue</button></form>`);
  session.slot = 2;
  const context = { session, sessionRecord: { address: '10 Oak St' }, options: {}, triggerLeadCheckAfterEmail() {} };
  await page.evaluate(() => {
    const form = document.querySelector('form'), address = form.elements.address;
    window.events = { inputs: 0, choices: 0, submits: 0 };
    address.oninput = () => { window.events.inputs++; address.dataset.populated = 'false'; };
    form.querySelector('.address-suggestions').onclick = event => {
      if (!event.target.matches('.address-item')) return;
      window.events.choices++;
    };
    form.onsubmit = event => {
      event.preventDefault();
      window.events.submits++;
      form.hidden = true;
    };
  });
  const menu = page.locator('.address-suggestions');
  assert.match((await fillPageForms(page, context))?.waitReason || '', /gợi ý/);
  assert.equal(page.mainFrame()._activeAutofillFormScope?.nativeForm, true, 'Form liên hệ gắn nhãn offer vẫn có phạm vi native');
  await menu.evaluate(list => { list.innerHTML = '<div class="address-item">110 Oak St</div>'; });
  assert.equal((await fillPageForms(page, context))?.waitingForAddress, true);
  assert.deepEqual(await page.evaluate(() => window.events), { inputs: 1, choices: 0, submits: 0 });
  await menu.evaluate(list => {
    list.innerHTML = '<div class="address-item" aria-disabled="true">10 Oak St (disabled)</div><div class="address-item">10 Oak St, Test City</div><div class="address-item">10 Oak St Unit B</div>';
    list.addEventListener('click', event => { list.dataset.chosen = event.target.textContent; });
  });
  assert.match((await fillPageForms(page, context))?.waitReason || '', /xác nhận/);
  assert.equal(await menu.getAttribute('data-chosen'), '10 Oak St, Test City');
  await page.locator('#address').evaluate(input => { input.value = '10 Oak Street, Test City'; });
  assert.match((await fillPageForms(page, context))?.waitReason || '', /xác nhận/);
  await page.waitForTimeout(2600);
  assert.match((await fillPageForms(page, context))?.waitReason || '', /xác nhận/);
  assert.deepEqual(await page.evaluate(() => window.events), { inputs: 1, choices: 1, submits: 0 });
  await page.evaluate(() => {
    document.querySelector('#address').dataset.populated = 'true';
    document.querySelector('button').disabled = false;
  });
  await fillPageForms(page, context);
  await fillPageForms(page, context);
  assert.deepEqual(await page.evaluate(() => window.events), { inputs: 1, choices: 1, submits: 1 });
  assert.equal(await page.locator('#address').inputValue(), '10 Oak Street, Test City');
});

test('địa chỉ đã chọn bằng tay được giữ sau khi widget xác nhận cách viết chuẩn', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { fillPageForms } = await import('../src/autofill/fill-page-forms.mjs');
  const { createFormScopeFixture } = await import('./helpers/form-scope-browser-fixture.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const { page, session } = await createFormScopeFixture(browser, `<form data-object-type="form" data-tf-element-role="offer">
    <label>Mailing Address<input id="address" name="address" required data-type="address" data-populated="false"></label>
    <input type="hidden" name="place_id"><div class="address-suggestions"></div><button disabled>Continue</button></form>`);
  session.slot = 2;
  const context = { session, sessionRecord: { address: '10 North Oak St' }, options: {} };
  await page.evaluate(() => {
    const form = document.querySelector('form');
    window.events = { inputs: 0, choices: 0, submits: 0 };
    form.elements.address.oninput = () => { window.events.inputs++; };
    form.onsubmit = event => { event.preventDefault(); window.events.submits++; form.hidden = true; };
  });
  assert.equal((await fillPageForms(page, context))?.waitingForAddress, true);
  await page.evaluate(() => {
    const form = document.querySelector('form'), input = form.elements.address;
    const list = form.querySelector('.address-suggestions');
    list.innerHTML = '<button class="address-item" type="button">10 N Oak Street, Test City</button>';
    list.firstElementChild.onmousedown = () => {
      window.events.choices++;
      input.value = '10 N Oak Street, Test City';
      input.dataset.street_line = '10 N Oak Street';
      input.dataset.populated = 'true';
      form.elements.place_id.value = 'local-result';
      form.querySelector('button[disabled]').disabled = false;
      list.replaceChildren();
    };
  });
  await page.locator('.address-item').click();
  const { readAddressSelection } = await import('../src/autofill/read-address-selection.mjs');
  const field = page.locator('#address'), token = page.locator('[name=place_id]');
  await token.evaluate(input => { input.value = ''; });
  assert.equal((await field.evaluate(readAddressSelection, context.sessionRecord.address)).retained, false);
  await token.evaluate(input => { input.value = 'local-result'; });
  await field.evaluate(input => { input.value = '110 N Oak Street, Test City'; });
  assert.equal((await field.evaluate(readAddressSelection, context.sessionRecord.address)).retained, false);
  await field.evaluate(input => { input.value = '10 N Oak Street, Test City'; });
  await fillPageForms(page, context);
  assert.deepEqual(await page.evaluate(() => window.events), { inputs: 1, choices: 1, submits: 1 });
  assert.equal(await page.locator('#address').inputValue(), '10 N Oak Street, Test City');
});
