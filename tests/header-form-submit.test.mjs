import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { findSubmitButton } from '../src/autofill/find-submit-button.mjs';
import { humanClick } from '../src/autofill/human-click.mjs';
import { selectActiveForm } from '../src/autofill/form-scope/select-active-form.mjs';
import { inspectFrameValidation } from '../src/autofill/inspect-frame-validation.mjs';

test('Form chuyển đổi đặt trong <header> hoặc hero banner được nhận diện và tìm thấy nút Continue', async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  // Test Case 1: Form hoàn chỉnh nằm trong <header class="hero">
  await page.setContent(`
    <header class="hero" id="offer-form">
      <form id="lead-form">
        <input type="email" name="email" value="user@example.com">
        <button type="submit" id="btnContinueEmail" onclick="event.preventDefault(); window.continueClicks = (window.continueClicks || 0) + 1">Continue</button>
      </form>
    </header>
  `);

  const btn1 = await findSubmitButton(page);
  assert.ok(btn1, 'Phải tìm thấy nút submit trong <header class="hero">');
  assert.strictEqual(await btn1.getAttribute('id'), 'btnContinueEmail');
  assert.equal(await humanClick(page, btn1), true, 'Primitive click phải cho phép Continue của Hero Form');
  assert.equal(await page.evaluate('window.continueClicks || 0'), 1, 'Nút Continue trong Hero Form phải phát sinh click event');

  const scope1 = await page.evaluate(selectActiveForm, { nextId: 'scope-1' });
  assert.ok(scope1, 'Phải chọn được active form scope trong header hero');

  const validation1 = await page.evaluate(inspectFrameValidation, scope1);
  assert.strictEqual(validation1.unfilled, false);

  // Test Case 2: Form không có thẻ form nhưng có input container trong <header>
  await page.setContent(`
    <header class="site-header">
      <div class="hero-section">
        <div class="form-container">
          <input type="email" name="email" value="tester@domain.com">
          <button type="button" id="btnNextStep">Next Step</button>
        </div>
      </div>
    </header>
  `);

  const btn2 = await findSubmitButton(page);
  assert.ok(btn2, 'Phải tìm thấy nút Next Step trong container div của header');
  assert.strictEqual(await btn2.getAttribute('id'), 'btnNextStep');

  // Test Case 3: Navigation menu trong header thuần túy (không có form/input) không bị nhận nhầm
  await page.setContent(`
    <header class="site-header">
      <nav>
        <a href="/login" id="navLogin">Login</a>
        <button id="navMenu" onclick="window.menuClicks = (window.menuClicks || 0) + 1">Menu</button>
      </nav>
    </header>
  `);

  const btn3 = await findSubmitButton(page);
  assert.strictEqual(btn3, null, 'Header navigation thuần túy không được coi là nút submit');
  assert.equal(await humanClick(page, page.locator('#navMenu')), false, 'Nút menu trong header không được click như CTA form');
  assert.equal(await page.evaluate('window.menuClicks || 0'), 0, 'Nút menu phải giữ nguyên trạng thái không được click');

  await browser.close();
});
