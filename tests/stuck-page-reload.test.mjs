import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
import { reloadStuckPage, STUCK_PAGE_RELOAD_MS } from '../src/autofill/stuck-page/reload-stuck-page.mjs';

/**
 * Tab giả: đếm số lần tải lại và cho test đổi URL.
 * @param {string} [url] URL ban đầu.
 * @return {object} Tab giả.
 */
function fakePage(url = 'https://offer.test/path1d.php') {
  const page = { currentUrl: url, reloads: 0, gotos: [], isClosed: () => false, url: () => page.currentUrl,
    reload: async () => { page.reloads += 1; }, goto: async target => { page.gotos.push(target); page.reloads += 1; } };
  return page;
}

/**
 * Quan sát liên tục mỗi 5 giây (đúng nhịp quét khi trang đứng yên) từ `from` tới `to`.
 * @return {Promise<boolean[]>} Kết quả từng lần gọi.
 */
async function observe(page, session, { from = 0, to, step = 5000, signature = 'same', options = {} }) {
  const results = [];
  for (let now = from; now <= to; now += step) results.push(await reloadStuckPage(page, session, signature, options, now));
  return results;
}

test('đứng yên 2 phút (URL, giao diện, thao tác không đổi) thì F5; chưa tới 2 phút thì không', async () => {
  const page = fakePage(), session = {};
  const before = await observe(page, session, { to: STUCK_PAGE_RELOAD_MS - 5000 });
  assert.equal(page.reloads, 0, 'chưa đủ 2 phút');
  assert.ok(before.every(result => result === false));
  assert.equal(await reloadStuckPage(page, session, 'same', {}, STUCK_PAGE_RELOAD_MS), true);
  assert.equal(page.reloads, 1, 'đủ 2 phút: F5 một lần');
  assert.equal(STUCK_PAGE_RELOAD_MS, 120_000);
});

test('luồng còn chạy thì không F5: giao diện đổi, có thao tác, hoặc đổi URL đều tính lại từ đầu', async () => {
  for (const [name, mutate] of [
    ['giao diện đổi', (page, session, step) => ({ signature: `sig-${step}` })],
    ['app vừa điền/bấm', (page, session, step) => { session.autofillActions = step; return {}; }],
    ['mốc thao tác mới (AI/survey)', (page, session, step) => { session.lastActionTime = step; return {}; }],
    ['URL đổi', (page, session, step) => { page.currentUrl = `https://offer.test/step${step}`; return {}; }],
  ]) {
    const page = fakePage(), session = {};
    for (let step = 0, now = 0; now <= 4 * STUCK_PAGE_RELOAD_MS; step++, now += 30_000) {
      const { signature = 'same' } = mutate(page, session, step);
      await reloadStuckPage(page, session, signature, {}, now);
    }
    assert.equal(page.reloads, 0, name);
  }
});

test('đang có việc chạy nền thì không F5 và không tính giờ: AI, agent, chờ lead, phục hồi lead, mở offer', async () => {
  const cases = [
    ['form chờ xác nhận địa chỉ', page => { page._autofillWaitReason = 'Chờ xác nhận'; }],
    ['AI assist', page => { page._aiAssistRunning = true; }],
    ['AI sửa form', page => { page._aiFormFixing = true; }],
    ['agent liên tục', page => { page._continuousAgent = {}; }],
    ['phục hồi trang lỗi của lead', page => { page._leadRecoveryInProgress = true; }],
    ['F5 màn gần cuối đang xử lý', page => { page._lateProgressRecoveryActive = true; }],
    ['đang kiểm lead', (page, session) => { session.leadCheckStatus = 'checking'; }],
    ['chế độ thủ công', (page, session) => { session.offerMode = 'manual'; }],
  ];
  for (const [name, setBusy] of cases) {
    const page = fakePage(), session = {};
    setBusy(page, session);
    await observe(page, session, { to: 3 * STUCK_PAGE_RELOAD_MS });
    assert.equal(page.reloads, 0, name);
  }
  // Hết bận thì đếm lại từ đầu, không F5 ngay.
  const page = fakePage(), session = {};
  page._aiAssistRunning = true;
  await observe(page, session, { to: 3 * STUCK_PAGE_RELOAD_MS });
  page._aiAssistRunning = false;
  assert.equal(await reloadStuckPage(page, session, 'same', {}, 3 * STUCK_PAGE_RELOAD_MS + 5000), false, 'vừa hết bận: chưa F5');
  assert.equal(page.reloads, 0);
});

test('khoảng trống quan sát (lượt quét bị chặn vì luồng khác đang chạy) không được tính là đứng yên', async () => {
  const page = fakePage(), session = {};
  await reloadStuckPage(page, session, 'same', {}, 0);
  // Không có lượt quét nào trong 3 phút (AI giữ tab, scan return sớm) rồi quét lại.
  assert.equal(await reloadStuckPage(page, session, 'same', {}, 3 * 60_000), false);
  assert.equal(page.reloads, 0);
  await observe(page, session, { from: 3 * 60_000 + 5000, to: 3 * 60_000 + STUCK_PAGE_RELOAD_MS - 5000 });
  assert.equal(page.reloads, 0, 'phải đứng yên liên tục đủ 2 phút sau khi quét lại');
});

test('không F5 trang có logic riêng: thankyou, paththankyou, toffers, adtrapper, trang lỗi', async () => {
  for (const url of ['https://financialhelpfinder.com/thankyou.php', 'https://blog.financialhelpfinder.com/paththankyou.php', 'https://offer.test/thank-you/',
    'https://toffers.top/click/?key=1', 'https://x.adtrapper.com/r', 'chrome-error://chromewebdata/', 'about:blank']) {
    const page = fakePage(url), session = {};
    await observe(page, session, { to: 3 * STUCK_PAGE_RELOAD_MS });
    assert.equal(page.reloads, 0, url);
  }
});

test('tối đa 3 lần F5 cho cùng một URL, mỗi lần cách nhau 2 phút; sang URL mới thì đếm lại', async () => {
  const page = fakePage(), session = {}, logs = [];
  const options = { onLog: entry => logs.push(entry) };
  await observe(page, session, { to: 10 * STUCK_PAGE_RELOAD_MS, options });
  assert.equal(page.reloads, 3);
  assert.equal(logs.filter(entry => entry.type === 'stuck_page_reload').length, 3);
  assert.equal(logs.filter(entry => entry.type === 'stuck_page_reload_exhausted').length, 1, 'báo hết lượt đúng một lần');
  page.currentUrl = 'https://offer.test/path1e.php';
  await observe(page, session, { from: 10 * STUCK_PAGE_RELOAD_MS + 5000, to: 11 * STUCK_PAGE_RELOAD_MS + 5000, options });
  assert.equal(page.reloads, 4, 'URL mới có lượt F5 riêng');
});

test('F5 bằng điều hướng GET lại URL (không gửi lại form POST); URL có # thì dùng reload', async () => {
  const page = fakePage('https://offer.test/submit-result.php?x=1'), session = {};
  await observe(page, session, { to: STUCK_PAGE_RELOAD_MS });
  assert.deepEqual(page.gotos, ['https://offer.test/submit-result.php?x=1']);
  const hashPage = fakePage('https://offer.test/app#/step3'), other = {};
  let reloaded = 0;
  hashPage.reload = async () => { reloaded += 1; };
  await observe(hashPage, other, { to: STUCK_PAGE_RELOAD_MS });
  assert.equal(reloaded, 1);
  assert.deepEqual(hashPage.gotos, []);
});

test('Chromium thật: trang POST đứng 2 phút được tải lại bằng GET, không gửi lại form', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  const requests = [];
  await context.route('**/*', route => {
    const request = route.request();
    if (!request.isNavigationRequest()) return route.abort();
    requests.push(request.method());
    return route.fulfill({ contentType: 'text/html', body: request.method() === 'POST' ? '<p>Processing…</p>' : '<form method="post" action="/result"><button>Go</button></form>' });
  });
  const page = await context.newPage();
  await page.goto('https://offer.test/form');
  await Promise.all([page.waitForNavigation(), page.click('button')]);
  assert.deepEqual(requests, ['GET', 'POST']);
  await observe(page, {}, { to: STUCK_PAGE_RELOAD_MS });
  assert.deepEqual(requests, ['GET', 'POST', 'GET'], 'tải lại bằng GET, không POST lần hai');
});

test('tích hợp: autofill thật trên Chromium, đồng hồ tua nhanh — trang đứng hình được F5; AI giữ tab thì không', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const { attachAutofill } = await import('../src/autofill/attach-autofill.mjs');
  const browser = await chromium.launch();
  t.after(() => browser.close());
  let offset = 0;
  const realNow = Date.now.bind(Date);
  t.mock.method(Date, 'now', () => realNow() + offset);
  // Tua 1 giây giả lập mỗi 0,2 giây thật (5 lần): lượt quét 500ms thật ≈ 2,5 giây giả lập; máy bận làm lượt quét trễ
  // vài giây thật vẫn dưới ngưỡng gián đoạn 15 giây (tua 10 lần thì máy bận vượt ngưỡng, test chập chờn).
  const ticker = setInterval(() => { offset += 1_000; }, 200);
  t.after(() => clearInterval(ticker));

  /** Mở một phiên autofill thật trên trang không có gì để làm; trả số lần trang được tải. */
  const run = async ({ holdByAi }) => {
    const context = await browser.newContext();
    let loads = 0;
    await context.route('**/*', route => {
      if (!route.request().isNavigationRequest()) return route.abort();
      loads += 1;
      return route.fulfill({ contentType: 'text/html', body: '<main><h1>Please wait…</h1><p>Your offer is loading.</p></main>' });
    });
    const page = await context.newPage();
    await page.goto('https://offer.test/path1d.php');
    if (holdByAi) page._aiAssistRunning = true;
    const logs = [];
    const session = { slot: 1, mainPage: page, browser: context, exitIp: '198.51.100.9', addBrowserLog: entry => logs.push(entry) };
    attachAutofill(context, [{ firstname: 'Fixture' }], 'https://offer.test', session, { onLog: entry => logs.push(entry), autoSubmit: true, enableLeadCheck: false });
    // Chờ theo giờ giả lập (đủ 4 phút, gấp đôi mốc F5 2 phút) thay vì giờ thật: khi cả suite chạy song song máy bận,
    // đồng hồ tua chậm lại và hạn giờ thật cũ (25 giây) hết trước khi tới mốc. Giờ thật chỉ còn là chốt an toàn.
    const startOffset = offset;
    const deadline = realNow() + 120_000;
    while (realNow() < deadline && offset - startOffset < 240_000 && !logs.some(entry => entry.type === 'stuck_page_reload')) await new Promise(resolve => setTimeout(resolve, 200));
    session.isClosed = true;
    await context.close();
    return { loads, reloaded: logs.some(entry => entry.type === 'stuck_page_reload') };
  };

  const idle = await run({ holdByAi: false });
  assert.equal(idle.reloaded, true, 'watcher thật phải gọi F5 khi trang đứng hình');
  assert.ok(idle.loads >= 2, 'trang được tải lại');
  const held = await run({ holdByAi: true });
  assert.equal(held.reloaded, false, 'AI đang giữ tab: không F5');
  assert.equal(held.loads, 1);
});

test('trước F5 chỉ ghi trạng thái địa chỉ, nhóm trường lỗi và nút gửi của form hiện tại', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const context = await browser.newContext();
  await context.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<form id="current">
    <input name="address" data-type="address" data-populated="true" value="private-street">
    <input type="tel" name="phone" required><input name="private-name" value="private-name">
    <button disabled>Continue</button></form><form><input type="email" required></form>` }));
  const page = await context.newPage();
  await page.goto('http://local.test/form');
  page.mainFrame()._activeAutofillFormScope = { rootSelector: '#current' };
  const logs = [];
  await observe(page, {}, { to: STUCK_PAGE_RELOAD_MS, options: { onLog: event => logs.push(event) } });
  const detail = logs.find(event => event.type === 'stuck_page_reload')?.detail || '';
  assert.match(detail, /Địa chỉ đã được trang xác nhận/);
  assert.match(detail, /điện thoại/);
  assert.match(detail, /nút gửi HTML đang khóa/);
  assert.doesNotMatch(detail, /private|email/);
});
