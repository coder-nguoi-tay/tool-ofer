import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { createFormScopeFixture } from '../helpers/form-scope-browser-fixture.mjs';
import { matchFieldValue, handleCustomGenderButtons, findSubmitButton } from "../../autofill.mjs";

test('Uplevel Rewards (#reg-container): matchFieldValue correctly matches all screen 1 fields', () => {
  const record = {
    firstname: 'Donald',
    lastname: 'Trump',
    address: '1100 S Ocean Blvd',
    city: 'Palm Beach',
    state: 'FL',
    zipcode: '33480',
    phone: '8145551234',
    email: 'sarah.lopez1416@gmail.com',
  };

  // 1. First Name (#fn, name="firstname", placeholder="First Name")
  const fnMatch = matchFieldValue(['First Name', 'firstname', 'fn', 'first name'], record, { type: 'text', name: 'firstname', id: 'fn' });
  assert.equal(fnMatch, 'Donald');

  // 2. Last Name (#ln, name="lastname", placeholder="Last Name")
  const lnMatch = matchFieldValue(['Last Name', 'lastname', 'ln', 'last name'], record, { type: 'text', name: 'lastname', id: 'ln' });
  assert.equal(lnMatch, 'Trump');

  // 3. Street Address (#ad, name="address1", placeholder="Street Address")
  const adMatch = matchFieldValue(['Street Address', 'address1', 'ad', 'Street Address'], record, { type: 'text', name: 'address1', id: 'ad' });
  assert.equal(adMatch, '1100 S Ocean Blvd');

  // 4. Zip Code (#zp, name="zippost", type="tel", maxlength="5", placeholder="Zip Code") - Cực kỳ quan trọng: type="tel" không được thành phone!
  const zpMatch = matchFieldValue(['Zip Code', 'zippost', 'zp', 'Zip Code'], record, { type: 'tel', name: 'zippost', id: 'zp', maxLength: 5 });
  assert.equal(zpMatch, '33480', 'Zip Code có type="tel" và name="zippost" phải trả về zipcode 33480, tuyệt đối không lấy phone');

  // 5. City (#ct, name="city", placeholder="City")
  const ctMatch = matchFieldValue(['City', 'city', 'ct', 'City'], record, { type: 'text', name: 'city', id: 'ct' });
  assert.equal(ctMatch, 'Palm Beach');

  // 6. Mobile Phone (#tl, name="telephone_two", type="tel")
  const tlMatch = matchFieldValue(['telephone_two', 'tl', 'Mobile Phone'], record, { type: 'tel', name: 'telephone_two', id: 'tl' });
  assert.equal(tlMatch, '8145551234');
});

test('Uplevel Rewards giữ trống họ tên khi hồ sơ chỉ có email chứa dấu chấm', () => {
  const recordWithoutNames = {
    address: '1100 S Ocean Blvd',
    city: 'Palm Beach',
    state: 'FL',
    zipcode: '33480',
    phone: '8145551234',
    email: 'sarah.lopez1416@gmail.com',
  };

  const fnMatch = matchFieldValue(['First Name', 'firstname', 'fn'], recordWithoutNames, { type: 'text', name: 'firstname', id: 'fn' });
  assert.equal(fnMatch, null);

  const lnMatch = matchFieldValue(['Last Name', 'lastname', 'ln'], recordWithoutNames, { type: 'text', name: 'lastname', id: 'ln' });
  assert.equal(lnMatch, null);
});

test('Uplevel Rewards giữ trống họ tên khi email chỉ có tên tài khoản', () => {
  const emptyRecord = {
    email: 'user1234@gmail.com',
  };

  const fnMatch = matchFieldValue(['First Name', 'firstname', 'fn'], emptyRecord, { type: 'text', name: 'firstname', id: 'fn' });
  assert.equal(fnMatch, null);

  const lnMatch = matchFieldValue(['Last Name', 'lastname', 'ln'], emptyRecord, { type: 'text', name: 'lastname', id: 'ln' });
  assert.equal(lnMatch, null, 'Không tự tạo họ mẫu khi không suy ra được từ dữ liệu');
});

test('Uplevel Rewards (#reg-container): handleCustomGenderButtons selects gender and updates hidden input', async () => {
  let evaluatedArgs = null;
  const mockFrame = {
    evaluate: async (fn, args) => {
      evaluatedArgs = args;
      return 1;
    },
  };

  const resFemale = await handleCustomGenderButtons(mockFrame, { gender: 'F' });
  assert.equal(resFemale, 1);
  assert.equal(evaluatedArgs.targetCode, 'F');
  assert.equal(evaluatedArgs.isFemale, true);

  const resMale = await handleCustomGenderButtons(mockFrame, { gender: 'Male' });
  assert.equal(resMale, 1);
  assert.equal(evaluatedArgs.targetCode, 'M');
  assert.equal(evaluatedArgs.isFemale, false);
});

test('Uplevel Rewards nhận #sub-btn trong #reg-container và bỏ CTA đứng ngoài', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { context, page } = await createFormScopeFixture(browser, '<main><div id="reg-container"><input name="email"><div class="sbtn" id="sub-btn">Continue</div></div></main><footer><a class="sbtn" href="/next">Continue</a></footer>');
  t.after(() => context.close());
  const submit = await findSubmitButton(page);
  assert.equal(await submit?.getAttribute('id'), 'sub-btn');
  await page.locator('#reg-container').evaluate(container => container.remove());
  assert.equal(Boolean(await findSubmitButton(page)), false);
});

test('Uplevel Rewards (#reg-container): City/Town matches correctly and falls back without phone leak', () => {
  const recordWithCity = {
    address: '1100 S Ocean Blvd',
    city: 'Palm Beach',
    state: 'FL',
    zipcode: '33480',
    phone: '8145551234',
    email: 'sarah.lopez1416@gmail.com',
  };

  const recordWithoutCityFL = {
    address: '1100 S Ocean Blvd',
    state: 'FL',
    zipcode: '33480',
    phone: '8145551234',
    email: 'sarah.lopez1416@gmail.com',
  };

  const recordWithoutCityAK = {
    address: '4125 N Inspiration Loop',
    state: 'AK',
    zipcode: '99654',
    phone: '8145551234',
    email: 'sarah.lopez1416@gmail.com',
  };

  // 1. Khi có city: phải lấy đúng Palm Beach
  const ctMatch = matchFieldValue(['City/Town', 'city', 'ct'], recordWithCity, { type: 'text', name: 'city', id: 'ct', placeholder: 'City/Town' });
  assert.equal(ctMatch, 'Palm Beach', 'City/Town phải nhận Palm Beach từ record');

  // 2. Khi thiếu city nhưng có state FL: phải nhận fallback Miami, TUYỆT ĐỐI không phải phone
  const ctFallbackFL = matchFieldValue(['City/Town', 'city', 'ct'], recordWithoutCityFL, { type: 'text', name: 'city', id: 'ct', placeholder: 'City/Town' });
  assert.equal(ctFallbackFL, 'Miami', 'Thiếu city nhưng có state FL thì tự động fallback Miami');
  assert.notEqual(ctFallbackFL, '8145551234', 'Tuyệt đối không lấy số điện thoại điền vào City/Town');

  // 3. Khi thiếu city nhưng có state AK: phải nhận fallback Wasilla
  const ctFallbackAK = matchFieldValue(['City/Town', 'city', 'ct'], recordWithoutCityAK, { type: 'text', name: 'city', id: 'ct', placeholder: 'City/Town' });
  assert.equal(ctFallbackAK, 'Wasilla', 'Thiếu city nhưng có state AK thì tự động fallback Wasilla');
  assert.notEqual(ctFallbackAK, '8145551234', 'Tuyệt đối không lấy số điện thoại điền vào City/Town');
});
