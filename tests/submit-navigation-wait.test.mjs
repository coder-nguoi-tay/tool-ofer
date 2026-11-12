import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { submitFrameForm } from '../src/autofill/submit-frame-form.mjs';

test('submit làm trang chuyển đi (link "Return to…") → không đứng chờ Locator nút cũ 30 giây', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({ viewport: { width: 1000, height: 700 } });
  await context.route('**/*', route => route.fulfill({
    contentType: 'text/html',
    body: route.request().url().includes('/home') ? '<form><input name="fname_input" placeholder="First Name"></form>' : '<form><input value="ready"><button type="button" id="go" onclick="location.href=\'https://form.test/home\'">Continue</button></form>'
  }));
  const page = await context.newPage();
  await page.goto('https://form.test/paththankyou.php');
  const session = { lastObservedUrl: page.url(), firstSubmitHandled: true, completedScreens: 1, autofillFields: 0 };
  const started = Date.now();
  await submitFrameForm({ options: {}, frame: page, page, session, frameProgress: { filledInThisPass: 1 }, record: {}, screenInfo: {}, scanStartUrl: page.url() });
  const elapsed = Date.now() - started;
  assert.match(page.url(), /\/home$/);
  assert.ok(elapsed < 8000, `submitFrameForm mất ${elapsed}ms`);
});
