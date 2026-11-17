import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { inspectAdsmithFrameLoading } from '../src/autofill/adsmith/inspect-frame-loading.mjs';
import { recoverAdsmithFrameLoading } from '../src/autofill/adsmith/recover-frame-loading.mjs';
import { inspectAdsmithFrameLoading as inspectOffer2615AdsmithFrameLoading } from '../src/autofill/offers/2615/solver/adsmith/inspect-frame-loading.mjs';
import { attachAutofillPageWatcher } from '../src/autofill/attach-autofill-page-watcher.mjs';

/**
 * Dựng mô hình tải Adsmith với đồng hồ ngoài, không dùng proxy hoặc website thật.
 * @param {string} condition Trạng thái spinner/blank/error/normal/unavailable cần kiểm tra.
 * @return {object} Tab giả và danh sách lần điều hướng GET.
 * @throws {never} Lỗi mạng giả chỉ xuất hiện khi test bật failNavigation.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
function createLoadingPage(condition) {
  const page = {
    condition, documentId: 1, currentUrl: 'https://blog.financialhelpfinder.com/path1c.php', navigations: [],
    url: () => page.currentUrl, isClosed: () => false,
    evaluate: async () => ({ applicable: true, iframe: page.condition !== 'spinner', source: 'https://www.adsmith.io/forge/v4/?plc=9235', spinner: true, documentId: page.documentId }),
    locator: () => ({ elementHandle: async () => ({ isVisible: async () => true, dispose: async () => {}, contentFrame: async () => ({
      url: () => page.condition === 'error' ? 'chrome-error://chromewebdata/' : page.condition === 'blank' ? 'about:blank' : 'https://www.adsmith.io/forge/v4/',
      evaluate: async () => { if (page.condition === 'unavailable') throw new Error('document unavailable'); return { hasWork: page.condition === 'normal', hasContent: false, hasImage: false }; }
    }) }) }),
    goto: async url => { page.navigations.push(url); if (page.failNavigation) throw new Error('proxy timeout'); }
  };
  return page;
}

test('spinner 25s, blank 20s và chrome-error 4s: không F5 sớm và dùng GET đúng trang cha', async () => {
  for (const [condition, threshold] of [['spinner', 25000], ['blank', 20000], ['error', 4000]]) {
    const page = createLoadingPage(condition);
    for (let now = 0; now < threshold; now += 1000) assert.equal(await recoverAdsmithFrameLoading(page, {}, {}, now), true);
    assert.equal(page.navigations.length, 0, condition);
    await recoverAdsmithFrameLoading(page, {}, {}, threshold);
    assert.deepEqual(page.navigations, [page.url()], condition);
  }
});

test('năm lần F5 tối đa, chờ đủ lượt cuối, log exhausted một lần; lỗi GET vẫn tiêu lượt', async () => {
  for (const failNavigation of [false, true]) {
    const page = createLoadingPage('spinner');
    page.failNavigation = failNavigation;
    const logs = [];
    for (let now = 0; now <= 160000; now += 1000) await recoverAdsmithFrameLoading(page, {}, { onLog: entry => logs.push(entry) }, now);
    assert.equal(page.navigations.length, 5);
    assert.equal(logs.filter(entry => entry.type === 'iframe_load_exhausted').length, 1);
    assert.match(logs.find(entry => entry.type === 'iframe_load_exhausted').detail, /5 lần/);
    assert.match(logs.filter(entry => entry.type === 'adsmith_loading_timeout_reload').at(-1).detail, /5\/5/);
    assert.equal(logs.filter(entry => entry.type === 'adsmith_loading_reload_failed').length, failNavigation ? 5 : 0);
    page.currentUrl += '#changed';
    for (let now = 161000; now <= 190000; now += 1000) await recoverAdsmithFrameLoading(page, {}, {}, now);
    assert.equal(page.navigations.length, 5, 'đổi hash không lấy thêm lượt');
    page.currentUrl = 'https://blog.financialhelpfinder.com/path1d.php';
    await recoverAdsmithFrameLoading(page, {}, {}, 191000);
    page.currentUrl = 'https://blog.financialhelpfinder.com/path1c.php';
    for (let now = 192000; now <= 220000; now += 1000) await recoverAdsmithFrameLoading(page, {}, {}, now);
    assert.equal(page.navigations.length, 5, 'quay lại URL cũ không lấy lại budget');
  }
});

test('mạng tự hồi phục, đổi giai đoạn, tạm mất DOM hoặc dừng quan sát phải chờ lại; giữ budget', async () => {
  const page = createLoadingPage('spinner');
  for (let now = 0; now <= 24000; now += 1000) await recoverAdsmithFrameLoading(page, {}, {}, now);
  page.condition = 'blank';
  for (let now = 25000; now <= 44000; now += 1000) await recoverAdsmithFrameLoading(page, {}, {}, now);
  assert.equal(page.navigations.length, 0);
  page.condition = 'normal';
  assert.equal(await recoverAdsmithFrameLoading(page, {}, {}, 45000), false);
  page.condition = 'unavailable';
  assert.equal(await recoverAdsmithFrameLoading(page, {}, {}, 46000), true);
  page.condition = 'blank';
  await recoverAdsmithFrameLoading(page, {}, {}, 47000);
  await recoverAdsmithFrameLoading(page, {}, {}, 80000);
  assert.equal(page.navigations.length, 0, 'không quan sát quá 15s phải chờ lại');
});

test('người dùng reload cùng URL thì chờ đủ thời gian của document mới, không F5 dồn ngay', async () => {
  const page = createLoadingPage('blank');
  for (let now = 0; now <= 19000; now += 1000) await recoverAdsmithFrameLoading(page, {}, {}, now);
  page.documentId = 2;
  for (let now = 20000; now <= 39000; now += 1000) await recoverAdsmithFrameLoading(page, {}, {}, now);
  assert.equal(page.navigations.length, 0);
  await recoverAdsmithFrameLoading(page, {}, {}, 40000);
  assert.equal(page.navigations.length, 1);
});

test('manual/AI/chờ lead không reload; nhiều lượt đồng thời chỉ phát một lần GET', async () => {
  for (const session of [{ offerMode: 'manual' }, { offerMode: 'skip' }, { offerMode: 'consent_only' }, { enableLeadCheck: true, leadCheckStatus: 'checking' }, { stopAutofillOnLead: true, confirmedLeadIp: '192.0.2.1' }]) {
    const page = createLoadingPage('error');
    for (let now = 0; now < 10000; now += 1000) await recoverAdsmithFrameLoading(page, session, {}, now);
    assert.equal(page.navigations.length, 0);
  }
  const page = createLoadingPage('error');
  for (let now = 0; now <= 3000; now += 1000) await recoverAdsmithFrameLoading(page, {}, {}, now);
  page._aiAssistRunning = true;
  await recoverAdsmithFrameLoading(page, {}, {}, 4000);
  page._aiAssistRunning = false;
  for (let now = 5000; now <= 8000; now += 1000) await recoverAdsmithFrameLoading(page, {}, {}, now);
  await Promise.all([recoverAdsmithFrameLoading(page, {}, {}, 9000), recoverAdsmithFrameLoading(page, {}, {}, 9000)]);
  assert.equal(page.navigations.length, 1);
});

test('nhận diện DOM thật: spinner/about:blank/Survey rỗng; không reload nội dung hoàn tất, iframe phụ hoặc form chính', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
  await page.goto('https://blog.financialhelpfinder.com/path1c.php');
  await page.setContent('<div id="AS_SURVEY" style="height:100px;background-image:url(load-spin-02.svg)"></div>');
  assert.equal((await inspectAdsmithFrameLoading(page)).state, 'spinner_stuck');
  await page.setContent('<div id="AS_SURVEY"><iframe id="AS_IFRAME" src="about:blank"></iframe></div>');
  assert.equal((await inspectAdsmithFrameLoading(page)).state, 'frame_blank');
  const frame = await page.locator('#AS_IFRAME').elementHandle().then(async element => { const result = await element.contentFrame(); await element.dispose(); return result; });
  await frame.setContent('<div class="Survey"></div>');
  assert.equal((await inspectAdsmithFrameLoading(page)).state, 'frame_blank');
  const spinnerSource = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80"/></svg>');
  await frame.setContent(`<div class="Survey"><img class="spinner" src="${spinnerSource}" width="80" height="80"><p>Loading...</p></div>`);
  await frame.locator('img').evaluate(image => image.decode());
  assert.equal((await inspectAdsmithFrameLoading(page)).state, 'frame_blank', 'ảnh spinner không phải nội dung khảo sát đã tải');
  await frame.setContent('<div class="Survey"><div class="Qst">What is your age?</div></div>');
  assert.equal((await inspectAdsmithFrameLoading(page)).state, 'normal');
  await frame.setContent('<p>Thank you, survey complete.</p>');
  assert.equal((await inspectAdsmithFrameLoading(page)).state, 'normal');
  await page.route('https://tracking.test/**', route => route.abort('failed'));
  await page.setContent('<div id="AS_SURVEY"><iframe id="AS_IFRAME" src="about:blank"></iframe></div><iframe src="https://tracking.test/broken"></iframe>');
  const surveyElement = await page.locator('#AS_IFRAME').elementHandle();
  const surveyFrame = await surveyElement.contentFrame();
  await surveyElement.dispose();
  await surveyFrame.setContent('<div class="Qst">What is your age?</div>');
  assert.equal((await inspectAdsmithFrameLoading(page)).state, 'normal', 'iframe tracking lỗi không kích hoạt phục hồi khảo sát');
  await page.route('https://www.adsmith.io/forge/**', route => route.abort('failed'));
  await page.setContent('<div id="AS_SURVEY"><iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235"></iframe></div>');
  assert.equal((await inspectAdsmithFrameLoading(page)).state, 'chrome_error');
  await page.setContent('<form><input name="firstname"></form><div id="AS_SURVEY" style="height:100px;background-image:url(load-spin-02.svg)"></div>');
  assert.equal((await inspectAdsmithFrameLoading(page)).state, 'not_applicable');
  await page.goto('https://financialhelpfinder.com.attacker.test/path1c.php');
  assert.equal((await inspectAdsmithFrameLoading(page)).state, 'not_applicable');
});

test('watcher giữ loading Adsmith trước autofill/AI và các luồng F5 khác', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<div id="AS_SURVEY" style="height:100px;background-image:url(load-spin-02.svg)"></div>' }));
  await page.goto('https://blog.financialhelpfinder.com/path1c.php');
  let fills = 0, aiRequests = 0;
  const session = { enableLeadCheck: false };
  attachAutofillPageWatcher(page, { trackedPages: new WeakSet(), session, record: {}, options: { stuckThreshold: 0, libraryFirstPassDelayMs: 0, onStuck: () => aiRequests++ }, fillVisibleForms: async () => fills++, checkLeadAfterEmailOnPage() {}, isSpamAdUrl: () => false, watchPage() {} });
  await delay(200);
  await page.triggerAutofillScan();
  assert.equal(fills, 0);
  assert.equal(aiRequests, 0);
  await page.close();
});

test('iframe Adsmith kẹt about:blank hoặc chỉ có thanh IP của AutoLeadPC vẫn là frame_blank (lỗi gặp trên Obscura 2026-11-18)', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  for (const inspect of [inspectAdsmithFrameLoading, inspectOffer2615AdsmithFrameLoading]) {
    const page = await browser.newPage();
    await page.route('https://blog.financialhelpfinder.com/**', route => route.fulfill({ contentType: 'text/html', body: '<html></html>' }));
    await page.goto('https://blog.financialhelpfinder.com/path1a.php');
    // Request iframe treo qua proxy: document vẫn about:blank dù src là Adsmith.
    await page.route('https://www.adsmith.io/forge/**', () => {});
    await page.setContent('<div id="AS_SURVEY"><iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235"></iframe></div>', { waitUntil: 'domcontentloaded' });
    assert.equal((await inspect(page)).state, 'frame_blank');
    // Document Adsmith chỉ có thanh IP do AutoLeadPC gắn: không phải nội dung khảo sát.
    await page.unroute('https://www.adsmith.io/forge/**');
    await page.route('https://www.adsmith.io/forge/**', route => route.fulfill({ contentType: 'text/html',
      body: '<body><div id="__autolead_ip_bar"><span data-autolead-ip>203.0.113.7</span> | <span>Slot 16</span></div></body>' }));
    await page.setContent('<div id="AS_SURVEY"><iframe id="AS_IFRAME" src="https://www.adsmith.io/forge/v4/?plc=9235"></iframe></div>');
    await page.frameLocator('#AS_IFRAME').locator('#__autolead_ip_bar').waitFor({ state: 'attached' });
    assert.equal((await inspect(page)).state, 'frame_blank');
    await page.close();
  }
});

test('ưu tiên hiện iframe offer: nạp lại riêng iframe 2 lần (6s, 12s) trước khi F5 trang cha ở 20s', async () => {
  const page = createLoadingPage('blank');
  const logs = [];
  const options = { onLog: entry => logs.push({ ...entry }) };
  for (let now = 0; now < 20000; now += 1000) assert.equal(await recoverAdsmithFrameLoading(page, {}, options, now), true);
  assert.deepEqual(logs.filter(entry => entry.type === 'adsmith_frame_reload').map(entry => entry.frameReloads), [1, 2]);
  assert.equal(page.navigations.length, 0, 'chưa F5 trang cha khi đang nạp lại iframe');
  await recoverAdsmithFrameLoading(page, {}, options, 20000);
  assert.deepEqual(page.navigations, [page.url()]);
});
