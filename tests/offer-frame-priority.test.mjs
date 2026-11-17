import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { recoverBlankOfferFrames } from '../src/autofill/frames/recover-blank-offer-frames.mjs';

const skip = !existsSync(chromium.executablePath());

test('ưu tiên iframe offer: iframe offer treo được nạp lại riêng (6s, 12s, tối đa 2 lần), trang cha giữ nguyên', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  let offerRequests = 0;
  await page.route('https://offer.example/**', () => { offerRequests++; });
  await page.route('https://parent.example/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto('https://parent.example/path');
  await page.setContent('<iframe src="https://offer.example/survey" width="600" height="500"></iframe>', { waitUntil: 'domcontentloaded' });
  const logs = [];
  const options = { onLog: entry => logs.push(entry) };
  for (const now of [0, 3000, 5999]) assert.equal(await recoverBlankOfferFrames(page, {}, options, now), false);
  assert.equal(await recoverBlankOfferFrames(page, {}, options, 6000), true);
  await page.waitForTimeout(150);
  assert.equal(await recoverBlankOfferFrames(page, {}, options, 9000), false);
  assert.equal(await recoverBlankOfferFrames(page, {}, options, 12000), true);
  await page.waitForTimeout(150);
  assert.equal(await recoverBlankOfferFrames(page, {}, options, 30000), false, 'hết 2 lượt thì nhường cho F5 trang cha');
  assert.deepEqual(logs.map(entry => [entry.type, entry.frameReloads]), [['offer_frame_reload', 1], ['offer_frame_reload', 2]]);
  assert.equal(offerRequests, 3, 'request đầu + 2 lần nạp lại iframe');
  assert.equal(page.url(), 'https://parent.example/path');
});

test('không nạp lại iframe đã có nội dung, iframe quảng cáo, iframe nhỏ hoặc Adsmith (đã có luồng riêng)', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://offer.example/**', route => route.fulfill({ contentType: 'text/html', body: '<button>Start survey</button>' }));
  await page.route('https://securepubads.g.doubleclick.net/**', () => {});
  await page.route('https://small.example/**', () => {});
  await page.route('https://www.adsmith.io/**', () => {});
  await page.route('https://parent.example/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto('https://parent.example/path');
  await page.setContent(`<iframe src="https://offer.example/ok" width="600" height="500"></iframe>
    <iframe src="https://securepubads.g.doubleclick.net/ad" width="600" height="500"></iframe>
    <iframe src="https://small.example/pixel" width="1" height="1"></iframe>
    <div id="AS_SURVEY"><iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/" width="600" height="500"></iframe></div>`, { waitUntil: 'domcontentloaded' });
  await page.frameLocator('iframe[src*="offer.example"]').locator('button').waitFor();
  const logs = [];
  for (const now of [0, 6000, 12000, 20000]) assert.equal(await recoverBlankOfferFrames(page, {}, { onLog: entry => logs.push(entry) }, now), false);
  assert.deepEqual(logs, []);
});
