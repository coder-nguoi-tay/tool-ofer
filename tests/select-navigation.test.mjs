import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { selectNativeOptionWithHumanInteraction } from '../src/autofill/select/select-native-option-with-human-interaction.mjs';
import { reportSelectMismatch } from '../src/autofill/report-select-mismatch.mjs';

test('reportSelectMismatch: trang đã chuyển (navigated) thì không báo select_value_unmatched', () => {
  const logs = [];
  const owner = { url: () => 'https://blog.example.test/paththankyou.php' };
  reportSelectMismatch(owner, { id: 'F_15559_BASE_ADD_ON_1', options: [] }, ['Yes'], { reason: 'navigated' }, { onLog: entry => logs.push(entry) }, null);
  assert.equal(logs.length, 0);
  reportSelectMismatch(owner, { id: 'F_15559_BASE_ADD_ON_1', options: [] }, ['Yes'], { reason: 'value_not_retained' }, { onLog: entry => logs.push(entry) }, null);
  assert.equal(logs.length, 1);
});

test('select có onchange chuyển trang → kết quả navigated, không phải value_not_retained', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext();
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: route.request().url().includes('next') ? '<p>next page</p>' : '<select id="renter" onchange="location.href=\'https://form.test/next\'"><option value="-1">Select One</option><option value="Yes">Yes</option><option value="No">No</option></select>' }));
  const page = await context.newPage();
  await page.goto('https://form.test/path1g.php');
  const field = await page.$('#renter');
  const result = await selectNativeOptionWithHumanInteraction({ page, field, target: { value: 'Yes', index: 1 } });
  assert.equal(result.verified, false);
  assert.equal(result.reason, 'navigated');
});
