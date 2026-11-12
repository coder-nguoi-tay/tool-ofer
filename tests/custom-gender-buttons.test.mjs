import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { handleCustomGenderButtons } from '../src/autofill/handle-custom-gender-buttons.mjs';

test('nút giới tính custom: không báo "đã chọn" khi không click được gì (#gender là bước form đang ẩn)', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  // Rút gọn selectmypolicy.com (2026-11-12): #gender là một bước funnel đang ẩn, nút là .genderPrimary.
  await page.setContent('<div id="gender" style="display:none"><h4>What is your gender?</h4><button class="genderPrimary" data-value="Male">Male</button></div><div id="birthdayInfo"><input id="birthday"></div>');
  for (let pass = 0; pass < 3; pass++) assert.equal(await handleCustomGenderButtons(page.mainFrame(), { gender: 'M' }), 0);

  await page.setContent('<div class="gender-group"><div id="male" class="gbtn" onclick="window.clicked=\'M\'">Male</div><div id="female" class="gbtn">Female</div></div>');
  assert.equal(await handleCustomGenderButtons(page.mainFrame(), { gender: 'M' }), 1);
  assert.equal(await page.evaluate(() => window.clicked), 'M');
  assert.equal(await handleCustomGenderButtons(page.mainFrame(), { gender: 'M' }), 0, 'đã chọn rồi thì không đếm lại');
});
