import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { recoverBlankOfferFrames } from '../src/autofill/frames/recover-blank-offer-frames.mjs';
import { inspectBlankFrameDocument, reloadObservedIframe } from '../src/autofill/frames/reload-observed-iframe.mjs';
import { attachFrameRequestTracking } from '../src/browser/frames/pending-frame-requests.mjs';

const skip = !existsSync(chromium.executablePath());

test('iframe đã tải xong nhưng vẫn trắng được nạp lại tối đa hai lần', { skip }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  attachFrameRequestTracking(page);
  let offerRequests = 0;
  await page.route('https://offer.example/**', route => { offerRequests++; return route.fulfill({ contentType: 'text/html', body: '<body></body>' }); });
  await page.route('https://parent.example/**', route => route.fulfill({ contentType: 'text/html', body: '<html><body></body></html>' }));
  await page.goto('https://parent.example/path');
  await page.setContent('<iframe src="https://offer.example/survey" width="600" height="500"></iframe>');
  const logs = [];
  const options = { onLog: entry => logs.push(entry) };
  for (const now of [0, 3000, 5999]) assert.equal(await recoverBlankOfferFrames(page, {}, options, now), false);
  const firstReload = page.waitForEvent('requestfinished', request => request.url() === 'https://offer.example/survey');
  assert.equal(await recoverBlankOfferFrames(page, {}, options, 6000), true);
  await firstReload;
  assert.equal(await recoverBlankOfferFrames(page, {}, options, 6000), false, 'bắt đầu lại thời gian chờ khi tài liệu con vừa tải xong');
  assert.equal(await recoverBlankOfferFrames(page, {}, options, 9000), false);
  const secondReload = page.waitForEvent('requestfinished', request => request.url() === 'https://offer.example/survey');
  assert.equal(await recoverBlankOfferFrames(page, {}, options, 12000), true);
  await secondReload;
  assert.equal(await recoverBlankOfferFrames(page, {}, options, 30000), false, 'hết 2 lượt phải dừng nạp lại iframe');
  assert.deepEqual(logs.map(entry => [entry.type, entry.frameReloads]), [['offer_frame_reload', 1], ['offer_frame_reload', 2]]);
  assert.equal(offerRequests, 3, 'request đầu + 2 lần nạp lại iframe');
  assert.equal(page.url(), 'https://parent.example/path');
});

test('XHR kết thúc giữa hai lần quét cho iframe trắng đủ thời gian render kết quả', { skip }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  attachFrameRequestTracking(page);
  let frameRequests = 0;
  await page.route('https://guard.test/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/parent') return route.fulfill({ contentType: 'text/html', body: '<main><iframe width="600" height="480" src="https://guard.test/child"></iframe></main>' });
    if (path === '/child') frameRequests++;
    return route.fulfill({ contentType: 'text/html', body: '<body></body>' });
  });
  await page.goto('https://guard.test/parent');
  const child = page.frames().find(frame => frame.parentFrame() === page.mainFrame());
  await recoverBlankOfferFrames(page, {}, {}, 0);
  const finished = page.waitForEvent('requestfinished', request => request.url().endsWith('/data'));
  await child.evaluate(() => new Promise(resolve => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => {
      window.renderResult = () => { document.body.textContent = 'Rendered'; };
      resolve();
    };
    xhr.open('GET', '/data');
    xhr.send();
  }));
  await finished;
  assert.equal(await recoverBlankOfferFrames(page, {}, {}, 7000), false);
  await child.evaluate(() => window.renderResult());
  assert.equal(await child.locator('body').textContent(), 'Rendered');
  assert.equal(frameRequests, 1);
});

test('iframe phản hồi chậm được tải đúng một lần, kể cả sau ngưỡng phục hồi', { skip }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  attachFrameRequestTracking(page);
  let requests = 0;
  let release;
  const responseGate = new Promise(resolve => { release = resolve; });
  t.after(() => release());
  await page.route('https://offer.example/slow', async route => {
    requests++;
    await responseGate;
    await route.fulfill({ contentType: 'text/html', body: '<p>Loaded</p>' });
  });
  const started = page.waitForRequest('https://offer.example/slow');
  await page.setContent('<iframe src="https://offer.example/slow" width="600" height="500"></iframe>', { waitUntil: 'domcontentloaded' });
  await started;
  for (const now of [0, 6000, 12000, 35000]) assert.equal(await recoverBlankOfferFrames(page, {}, {}, now), false);
  release();
  await page.frameLocator('iframe').getByText('Loaded').waitFor();
  assert.equal(requests, 1);
});

test('lượt phục hồi cũ không ghi đè địa chỉ mới do trang chọn', { skip }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  attachFrameRequestTracking(page);
  await page.route('https://offer.example/**', route => route.fulfill({ contentType: 'text/html',
    body: route.request().url().endsWith('/new') ? '<p>New document</p>' : '<body></body>' }));
  await page.goto('https://offer.example/parent');
  await page.setContent('<iframe src="https://offer.example/old" width="600" height="500"></iframe>');
  await recoverBlankOfferFrames(page, {}, {}, 0);
  await page.locator('iframe').evaluate(iframe => {
    const observer = new MutationObserver(() => {
      observer.disconnect();
      iframe.src = 'https://offer.example/new';
    });
    observer.observe(iframe, { attributes: true, attributeFilter: ['src'] });
  });
  assert.equal(await recoverBlankOfferFrames(page, {}, {}, 6000), true);
  await page.frameLocator('iframe').getByText('New document').waitFor();
  await page.waitForTimeout(100);
  assert.equal(await page.locator('iframe').getAttribute('src'), 'https://offer.example/new');
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

/**
 * Kiểm tra quan sát cũ khi tài liệu con tự điều hướng, đổi nội dung hoặc nhận một tài liệu khác cùng URL.
 * @param {import('node:test').TestContext} t Context dọn Chromium và fixture.
 * @return {Promise<void>} Mọi trạng thái mới của tài liệu con được giữ nguyên.
 * @throws {Error} Khi iframe bị đưa về trạng thái trắng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function verifyDraftSurvivesIframeRecovery(t) {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<main></main>' }));
  await page.goto('https://parent.test/');
  for (const source of ['https://parent.test/child', 'https://child.test/child']) {
    await page.setContent('<iframe src="' + source + '"></iframe>');
    const frame = page.frames().find(candidate => candidate.parentFrame());
    const documentId = await page.evaluate(() => performance.timeOrigin);
    const observation = { source, documentId, ...await frame.evaluate(inspectBlankFrameDocument) };
    assert.equal(observation.blank, true);
    await frame.evaluate(() => history.pushState({}, '', '/draft'));
    assert.equal(await reloadObservedIframe(page, frame, observation, 0), false, 'URL con đã đổi');
    await frame.evaluate(() => {
      history.replaceState({}, '', '/child');
      document.body.innerHTML = '<input value="local draft">';
    });
    assert.equal(await reloadObservedIframe(page, frame, observation, 0), false, 'URL cũ nhưng form vừa xuất hiện');
    assert.equal(await frame.locator('input').inputValue(), 'local draft');
    await frame.goto(source);
    assert.equal(await reloadObservedIframe(page, frame, observation, 0), false, 'cùng URL nhưng document đã đổi');
  }
}
test('không tải lại khi frame con có URL, tài liệu hoặc nội dung mới', { skip }, verifyDraftSurvivesIframeRecovery);
