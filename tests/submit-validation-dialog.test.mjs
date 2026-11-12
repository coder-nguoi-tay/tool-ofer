import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { submitFrameForm } from '../src/autofill/submit-frame-form.mjs';
import { recordPageDialog } from '../src/autofill/record-page-dialog.mjs';

test('recordPageDialog: nhận thông báo lỗi nhập liệu, bỏ qua thông báo thường', () => {
  const page = {};
  recordPageDialog(page, { message: () => 'Please enter a birthday in the format: MM/DD/YYYY', type: () => 'alert' });
  assert.equal(page._uxLastDialog.validation, true);
  recordPageDialog(page, { message: () => 'Thanks for visiting!', type: () => 'alert' });
  assert.equal(page._uxLastDialog.validation, false);
});

test('submit bị website chặn bằng alert lỗi nhập liệu → không tính là đã submit / có tiến triển', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  page.on('dialog', dialog => { recordPageDialog(page, dialog); void dialog.accept(); });
  await page.setContent('<form><input id="birthday" placeholder="MM/DD/YYYY"><button type="button" id="go" onclick="alert(\'Please enter a birthday in the format: MM/DD/YYYY\')">Continue</button></form>');
  const logs = [];
  const session = { firstSubmitHandled: true, completedScreens: 1, autofillFields: 0, autofillActions: 0 };
  await submitFrameForm({ options: { onLog: entry => logs.push(entry.type) }, frame: page, page, session, frameProgress: { filledInThisPass: 1 }, record: {}, screenInfo: {}, scanStartUrl: page.url() });
  assert.ok(logs.includes('submit_rejected_dialog'), logs.join(','));
  assert.ok(!logs.includes('submit_clicked'), logs.join(','));
  assert.equal(session.autofillActions, 0);
});
