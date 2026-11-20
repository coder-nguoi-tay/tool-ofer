import './helpers/obscura-data-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { matchFieldValue } from '../src/autofill/match-field-value.mjs';

// Record dạng tách: birthday = NGÀY trong tháng (log 2026-11-12 selectmypolicy: điền "13" vào ô MM/DD/YYYY).
const split = { birthmonth: '9', birthday: '13', birthyear: '1988', firstname: 'Lisa' };

test('ô "birthday" MM/DD/YYYY với record tách tháng/ngày/năm → ngày sinh đầy đủ, không phải "13"', () => {
  assert.equal(matchFieldValue(['birthday', 'mm/dd/yyyy'], split, { type: 'text', name: 'birthday', id: 'birthday' }), '09/13/1988');
  assert.equal(matchFieldValue(['birthday'], split, { type: 'date', name: 'birthday' }), '1988-09-13');
});

test('ô "birthday" 2 ký tự (ô ngày riêng) vẫn nhận ngày trong tháng', () => {
  assert.equal(matchFieldValue(['birthday'], split, { type: 'text', name: 'birthday', maxLength: 2 }), '13');
});

test('record có birthday là ngày đầy đủ vẫn giữ hành vi cũ', () => {
  assert.equal(matchFieldValue(['birthday'], { birthday: '09/13/1988' }, { type: 'text', name: 'birthday' }), '09/13/1988');
});

/**
 * Kiểm tra bước ngày sinh có nhãn chung và chỉ cho phép thao tác bước đang hiện.
 * @param {import('node:test').TestContext} t Ngữ cảnh dọn phiên thử nghiệm.
 * @param {object} page Trang cục bộ trên engine cần kiểm tra.
 * @return {Promise<void>} Hoàn tất khi tự chọn tháng, đồng bộ DOB và chuyển bước đúng một lần.
 * @throws {Error} Khi engine không chuyển bước hoặc trường nhận dữ liệu sai.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function verifySharedDobLabelForm(t, page) {
  const http = await import('node:http');
  const { attachAutofill } = await import('../src/autofill/attach-autofill.mjs');
  const html = `<!doctype html><meta name="viewport" content="width=device-width"><form id="formSubmit">
    <div id="step1" class="step" style="display:block">
      <label>First Name<input name="first_name" required></label>
      <label>Last Name<input name="last_name" required></label>
      <label for="dob_month">Date of Birth</label>
      <input type="hidden" id="dob" name="dob">
      <select name="dob_month" id="dob_month" required>
        <option value="" hidden>Month</option>${Array.from({ length: 12 }, (_, index) => '<option value="' + (index + 1) + '">' + (index + 1) + '</option>').join('')}
      </select>
      <select name="dob_day" id="dob_day" required><option value="">Day</option><option value="13" selected>13</option></select>
      <select name="dob_year" id="dob_year" required><option value="">Year</option><option value="1988" selected>1988</option></select>
      <label for="gender">Gender</label><select id="gender" name="gender" required><option value="">Select Gender</option><option value="male" selected>Male</option></select>
    </div>
    <div id="step2" class="step" style="display:none">
      <label>Address<input name="address" disabled required></label>
    </div>
    <button type="submit" name="registration" class="continue-button">Continue</button>
    </form><script>
    window.fixtureEvents = { monthChanges: 0, continues: 0, submits: 0 };
    const form = document.querySelector('form');
    const month = form.elements.dob_month;
    for (const fieldName of ['dob_month', 'dob_day', 'dob_year']) {
      form.elements[fieldName].addEventListener('change', () => {
        if (fieldName === 'dob_month') window.fixtureEvents.monthChanges++;
        const monthValue = month.value.padStart(2, '0');
        const dayValue = form.elements.dob_day.value.padStart(2, '0');
        const yearValue = form.elements.dob_year.value;
        document.querySelector('#dob').value = month.value && dayValue && yearValue
          ? yearValue + '-' + monthValue + '-' + dayValue : '';
      });
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      window.fixtureEvents.submits++;
    });
    form.querySelector('button').addEventListener('click', event => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      window.fixtureEvents.continues++;
      const firstStep = document.querySelector('#step1');
      const secondStep = document.querySelector('#step2');
      firstStep.style.display = 'none';
      firstStep.querySelectorAll('input,select').forEach(input => { input.disabled = true; });
      secondStep.style.display = 'block';
      secondStep.querySelector('input').disabled = false;
      event.currentTarget.disabled = true;
    });
    </script>`;
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  await page.goto('http://127.0.0.1:' + server.address().port + '/fixture');
  const record = { ...split, firstname: 'Fixture', lastname: 'Person', gender: 'male' };
  const session = {
    slot: 2, mainPage: page, browser: page.context(), currentRecord: record,
    firstSubmitHandled: true, enableLeadCheck: false
  };
  attachAutofill(page.context(), [record], new URL(page.url()).origin, session, {
    autoSubmit: true, aiConfig: { enabled: false }
  });
  await page.waitForFunction(() => window.fixtureEvents.continues === 1, null, { timeout: 20000 });
  assert.deepEqual(await page.evaluate(() => ({
    month: document.querySelector('#dob_month').value,
    day: document.querySelector('#dob_day').value,
    year: document.querySelector('#dob_year').value,
    dob: document.querySelector('#dob').value,
    ...window.fixtureEvents
  })), { month: '9', day: '13', year: '1988', dob: '1988-09-13', monthChanges: 1, continues: 1, submits: 0 });
  assert.equal(await page.locator('#step2').isVisible(), true);
  assert.equal(await page.locator('#step2 input').inputValue(), '');
}

test('Chromium chọn tháng theo record và chuyển bước của form GetnGoods', { timeout: 30000 }, async t => {
  const { chromium } = await import('playwright');
  const { existsSync } = await import('node:fs');
  if (!existsSync(chromium.executablePath())) {
    t.skip('Chưa cài Chromium');
    return;
  }
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await verifySharedDobLabelForm(t, page);
});

for (const os of ['windows', 'android', 'iphone', 'ipad']) {
  test('Obscura ' + os + ' chọn tháng theo record và chuyển bước của form GetnGoods', { timeout: 30000 }, async t => {
    const { resolveObscuraBinary } = await import('../src/obscura-engine/resolve-obscura-binary.mjs');
    try {
      resolveObscuraBinary();
    } catch {
      t.skip('Chưa có binary Obscura');
      return;
    }
    const { openObscuraBrowser } = await import('../src/obscura-engine/open-obscura-browser.mjs');
    const session = await openObscuraBrowser({ slot: 991, port: 0, os, registerSession: false });
    t.after(() => session.close());
    await verifySharedDobLabelForm(t, session.page);
  });
}


test('nhãn Date of Birth dùng chung vẫn phân biệt select tháng, ngày, năm theo định danh của từng ô', async () => {
  const { matchFieldValue: matchOfferField } = await import('../src/autofill/offers/2615/solver/match-field-value.mjs');
  const { resolveProvidedFieldValue } = await import('../src/autofill/record-values/resolve-provided-field-value.mjs');
  for (const matcher of [matchFieldValue, matchOfferField]) {
    for (const [name, expected] of [['dob_month', '09'], ['dob_day', '13'], ['dob_year', '1988']]) {
      const metadata = { id: name, name, kind: 'select', accessibleName: 'Date of Birth', label: 'Date of Birth', names: ['Date of Birth', name] };
      assert.equal(matcher(metadata.names, split, metadata), expected, name);
      assert.equal(resolveProvidedFieldValue(metadata, split), expected, 'repair ' + name);
    }
  }
});

test('ngày sinh ISO và nhãn ARIA chung vẫn trả đúng thành phần, giữ nhãn riêng của trường liên hệ', () => {
  const metadata = { id: 'dob_month', name: 'dob_month', kind: 'select', accessibleName: 'Date of Birth', ariaLabel: 'Date of Birth', names: ['Date of Birth', 'dob_month'] };
  assert.equal(matchFieldValue(metadata.names, { dob: '1988-09-13' }, metadata), '09');
  assert.equal(matchFieldValue(metadata.names, split, { ...metadata, accessibleName: 'Phone Number', ariaLabel: '', label: 'Phone Number' }), null);
  assert.equal(matchFieldValue(['Date of Birth', 'dob'], split, { kind: 'input', type: 'text', id: 'dob', name: 'dob', accessibleName: 'Date of Birth' }), '09/13/1988');
});
