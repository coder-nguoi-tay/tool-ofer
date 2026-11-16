import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { decorateGoLoginPages } from '../src/browser/gologin/decorate-profile-pages.mjs';

/**
 * Kiểm tra IP trên thanh/title theo IP phiên mới trên tab đang mở, reload và tab khác origin.
 * @param {object} contextTest Test context dùng để dọn Chromium cô lập.
 * @return {Promise<void>} Title/bar đồng bộ, không sửa IP do website hiển thị trong nội dung.
 * @throws {AssertionError} Khi giữ IP cũ hoặc tạo nhiều thanh nhận diện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
async function updatesGoLoginIpDisplay(contextTest) {
  const browser = await chromium.launch({ headless: true });
  contextTest.after(() => browser.close());
  const context = await browser.newContext();
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><head><title>Offer</title></head><body><p id="website-ip">203.0.113.99</p></body></html>' }));
  const session = { browser: context, exitIp: '192.0.2.10', slot: 1, deviceProfile: 'windows11', chromeVersion: 'Orbita 156' };
  await decorateGoLoginPages(session);
  const page = await context.newPage();
  await page.goto('https://offer.test/');
  assert.match(await page.title(), /^\[192\.0\.2\.10\] \[S1\]/);
  session.exitIp = '192.0.2.20';
  await decorateGoLoginPages(session);
  assert.match(await page.title(), /^\[192\.0\.2\.20\] \[S1\]/);
  assert.match(await page.locator('#__autolead_ip_bar').innerText(), /192\.0\.2\.20/);
  assert.equal(await page.locator('#website-ip').innerText(), '203.0.113.99');
  await page.reload();
  assert.match(await page.title(), /^\[192\.0\.2\.20\] \[S1\]/);
  const otherPage = await context.newPage();
  await otherPage.goto('https://other-offer.test/');
  assert.match(await otherPage.title(), /^\[192\.0\.2\.20\] \[S1\]/);
  await page.evaluate(() => { document.title = 'Next step'; });
  await page.waitForFunction(() => document.title === '[192.0.2.20] [S1] Next step');
  assert.equal(await page.locator('#__autolead_ip_bar').count(), 1);
  assert.equal(await otherPage.locator('#__autolead_ip_bar').count(), 1);
}

test('GoLogin cập nhật IP title/bar khi IP phiên thay đổi, kể cả reload và tab mới', { skip: !existsSync(chromium.executablePath()) && 'Chưa cài Chromium' }, updatesGoLoginIpDisplay);
