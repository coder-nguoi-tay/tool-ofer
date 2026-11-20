import './helpers/obscura-data-fixture.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { openObscuraBrowser } from '../src/obscura-engine/open-obscura-browser.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';
import { attachAutofill } from '../src/autofill/attach-autofill.mjs';
import { resolveActiveFormScope } from '../src/autofill/form-scope/resolve-active-form-scope.mjs';
import { OFFERWALL_CARD_SELECTOR } from '../src/autofill/state/offerwall-card-selector.mjs';
import { readOfferwallCards } from '../src/autofill/read-offerwall-cards.mjs';
import { handlePostScreenTabs } from '../src/http/routes/screen/post-tabs.mjs';
import { handleGetScreenStream } from '../src/http/routes/screen/get-stream.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { screencastSessions } from '../src/runtime/constants/screencast-sessions.mjs';
import { resolveDebugPage } from '../src/browser/screen/resolve-debug-page.mjs';

let available = true;
try { resolveObscuraBinary(); } catch { available = false; }

const fixture = `<!doctype html><meta charset=utf-8>
<div id="ai-funnel"><form id="contact" data-tf-element-role="offer" data-object-type="form">
<label>Full name<input name="name" value="Fixture Person" required></label>
<label>Mailing address<input name="address" data-type="address" data-populated="false" required></label>
<div class="address-suggestions"></div><label>Phone<input type="tel" name="phone" value="2025550123" required></label>
<button id="submit-button" disabled>Agree &amp; Submit Entry</button></form></div>
<script>
window.fixtureEvents = { inputs: 0, selected: 0, submitted: 0 };
const form = document.querySelector('form'), address = form.elements.address, menu = document.querySelector('.address-suggestions');
address.oninput = () => {
  window.fixtureEvents.inputs++;
  setTimeout(() => {
    menu.innerHTML = '<a class="address-item" data-street_line="10 Oak St">10 Oak St, Test City</a>';
    menu.firstElementChild.onmousedown = () => {
      window.fixtureEvents.selected++;
      address.value = '10 Oak Street, Test City';
      menu.replaceChildren();
      setTimeout(() => { address.dataset.populated = 'true'; form.querySelector('button').disabled = false; }, 700);
    };
  }, 500);
};
form.onsubmit = event => { event.preventDefault(); window.fixtureEvents.submitted++; form.hidden = true; };
</script>`;

for (const os of ['windows', 'android', 'ipad']) {
  test(`Obscura ${os}: form liên hệ gắn nhãn offer tự chọn địa chỉ rồi gửi một lần`, { skip: !available, timeout: 30000 }, async t => {
    const server = http.createServer((request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      response.end(fixture);
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const session = await openObscuraBrowser({ slot: 991, port: 0, os, registerSession: false });
    t.after(() => session.close());
    const page = session.page;
    await page.goto(`http://127.0.0.1:${server.address().port}/fixture`);
    const scope = await resolveActiveFormScope(page);
    assert.equal(scope?.nativeForm, true);
    assert.equal(scope?.visibleFieldCount, 3);
    assert.deepEqual(await page.evaluate(readOfferwallCards, OFFERWALL_CARD_SELECTOR), [], 'Không coi form liên hệ thành thẻ offer');
    const record = { name: 'Fixture Person', address: '10 Oak St', phone: '2025550123' };
    session.currentRecord = record;
    session.mainPage = page;
    session.enableLeadCheck = false;
    session.firstSubmitHandled = true;
    attachAutofill(session.browser, [record], new URL(page.url()).origin, session, {
      autoSubmit: true, aiConfig: { enabled: false }
    });
    await page.waitForFunction(() => window.fixtureEvents.submitted === 1, null, { timeout: 22000 });
    await new Promise(resolve => setTimeout(resolve, 700));
    assert.deepEqual(await page.evaluate(() => window.fixtureEvents), { inputs: 1, selected: 1, submitted: 1 });
    assert.equal(await page.locator('[name=address]').inputValue(), '10 Oak Street, Test City');
    assert.equal(session.browser.pages().length, 1);
  });
}

test('Screen View Obscura chuyển CDP, hình ảnh và trang điều khiển qua lại giữa hai tab', { skip: !available, timeout: 30000 }, async t => {
  const session = await openObscuraBrowser({ slot: 993, port: 0, registerSession: false });
  activeBrowsers.add(session);
  t.after(async () => {
    await screencastSessions.get(993)?.cleanup?.();
    await session.close();
  });
  const root = session.page;
  session.mainPage = root;
  await root.goto('data:text/html,<body style="background:red"><h1>Parent fixture</h1></body>');
  const child = await session.browser.newPage();
  await child.goto('data:text/html,<body style="background:blue"><h1>Child fixture</h1></body>');
  const server = http.createServer(async (request, response) => {
    if (await handleGetScreenStream(request, response)) return;
    if (await handlePostScreenTabs(request, response)) return;
    response.writeHead(404);
    response.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const abort = new AbortController();
  t.after(() => abort.abort());
  const stream = await fetch(url + '/screen/stream/993', { signal: abort.signal });
  const reader = stream.body.getReader();
  const first = await reader.read();
  assert.ok(first.value.length > 0);
  // API SSE gửi header trước khi attach xong, đợi nguồn CDP ban đầu được gắn.
  const deadline = Date.now() + 5000;
  while (!screencastSessions.get(993)?.page && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
  const state = screencastSessions.get(993);
  assert.equal(state?.page, root);
  for (const [index, target] of [[1, child], [0, root], [1, child]]) {
    const response = await fetch(url + '/screen/tabs/993', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ index })
    });
    assert.equal(response.status, 200, JSON.stringify(await response.clone().json()));
    assert.equal(state.page, target);
    assert.equal(state.slot, 993);
    assert.equal(state.session, session);
    assert.equal(resolveDebugPage(993), target);
    const content = await state.cdpClient.send('Runtime.evaluate', {
      expression: 'document.querySelector("h1").textContent', returnByValue: true
    });
    assert.equal(content.result.value, target === child ? 'Child fixture' : 'Parent fixture');
    const shot = await state.cdpClient.send('Page.captureScreenshot', { format: 'jpeg', quality: 40 });
    assert.ok(shot.data.length > 0);
  }
  assert.equal(root.isClosed(), false);
  assert.equal(child.isClosed(), false);
});

test('giao diện chỉ đổi tab khi API thành công và thông báo khi chuyển thất bại', async () => {
  const code = await readFile(new URL('../ui/desktop/functions/_switch-tab.js', import.meta.url), 'utf8');
  const errors = [];
  let success = false, renders = 0;
  const panel = { style: { display: 'block' }, dataset: {} };
  const sandbox = {
    _screenActiveTabIndex: 0, document: { getElementById: () => panel },
    fetch: async () => ({ ok: success, json: async () => success ? { ok: true } : { error: 'fixture failure' } }),
    showToast: message => errors.push(message),
    _fetchAndRenderTabs: async () => { renders++; }
  };
  runInNewContext(code, sandbox);
  await sandbox._switchTab(1, 1);
  assert.equal(sandbox._screenActiveTabIndex, 0);
  assert.equal(panel.style.display, 'block');
  assert.deepEqual(errors, ['fixture failure']);
  success = true;
  await sandbox._switchTab(1, 1);
  assert.equal(sandbox._screenActiveTabIndex, 1);
  assert.equal(panel.style.display, 'none');
  assert.equal(renders, 1);
  let answerB;
  sandbox.fetch = async (_url, options) => {
    if (JSON.parse(options.body).index === 1) await new Promise(resolve => { answerB = resolve; });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  const b = sandbox._switchTab(1, 1);
  await sandbox._switchTab(1, 2);
  answerB();
  await b;
  assert.equal(sandbox._screenActiveTabIndex, 2);
  assert.equal(renders, 2);

});


for (const logging of ['default', 'off']) {
  test(`ObscuraInput ${logging} ghi đúng kết quả click của engine`, { skip: !available, timeout: 30000 }, async t => {
    const originalFlag = process.env.AUTOLEADPC_OBSCURA_INPUT_LOG;
    if (logging === 'off') process.env.AUTOLEADPC_OBSCURA_INPUT_LOG = '0';
    else delete process.env.AUTOLEADPC_OBSCURA_INPUT_LOG;
    t.after(() => {
      if (originalFlag === undefined) delete process.env.AUTOLEADPC_OBSCURA_INPUT_LOG;
      else process.env.AUTOLEADPC_OBSCURA_INPUT_LOG = originalFlag;
    });
    const lines = [];
    t.mock.method(console, 'info', line => {
      if (String(line).includes('[ObscuraInput]')) lines.push(line);
    });
    const session = await openObscuraBrowser({ slot: 997, port: 0, registerSession: false });
    t.after(() => session.close());
    const page = session.page;
    await page.goto('data:text/html,<body><input type="radio" id="private-fixture" style="width:40px;height:40px"></body>');
    const input = page.locator('input');
    const bounds = await input.boundingBox();
    assert.ok(bounds);
    const point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2, button: 'left' };
    const client = await session.browser.newCDPSession(page);
    await client.send('Input.dispatchMouseEvent', { ...point, type: 'mouseMoved' });
    await client.send('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased' });
    await input.evaluate(el => el.addEventListener('click', event => event.preventDefault(), { once: true }));
    await page.mouse.click(point.x, point.y);
    assert.equal(await input.isChecked(), false);
    await page.mouse.click(point.x, point.y);
    assert.equal(await input.isChecked(), true);
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: point.x, y: point.y }] });
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // Chờ pipe stderr bất đồng bộ được tháo hết trước khi kiểm tra cả trường hợp tắt log.
    const engineClosed = new Promise(resolve => session.process.once('close', resolve));
    if (logging === 'default') {
      for (let i = 0; i < 60; i++) await client.send('Input.dispatchMouseEvent', { ...point, type: 'mouseReleased' });
    }
    await session.close();
    await engineClosed;
    if (logging === 'off') {
      assert.deepEqual(lines, []);
      return;
    }
    assert.match(lines[0], /^\[Process\] \S+ slot=997 pid=\d+ \[ObscuraInput\] ready$/);
    const begin = lines.filter(line => line.includes(' begin '));
    const end = lines.filter(line => line.includes(' end '));
    assert.equal(begin.length, 60);
    assert.equal(end.length, 60);
    assert.equal(lines.filter(line => line.endsWith(' rate_limited')).length, 1);
    assert.deepEqual(begin.slice(0, 7).map(line => line.match(/ op=(\w+)$/)[1]),
      ['up', 'down', 'up', 'down', 'up', 'touch_start', 'touch_end']);
    assert.deepEqual(end.slice(0, 7).map(line => line.match(/ result=(\w+)/)[1]),
      ['unmatched_press', 'pressed', 'cancelled', 'pressed', 'checked', 'touch_unhandled', 'touch_unhandled']);
    for (let i = 0; i < begin.length; i++) {
      assert.match(begin[i], new RegExp(` begin seq=${i + 1} tab=[1-9]\\d* id=\\d+ op=\\w+$`));
      assert.match(end[i], new RegExp(` end seq=${i + 1} frame=0 result=\\w+ wait_ms=\\d+ run_ms=\\d+$`));
    }
    assert.equal(lines.some(line => /private-fixture|data:text|mouseMoved/.test(line)), false);
  });
}

test('Screen View nhận đúng ảnh tab con trong khi POST ở tab chính còn chờ', { skip: !available, timeout: 60000 }, async t => {
  const holdMs = Number(process.env.SCREEN_TEST_HOLD_MS || 0);
  const lines = [];
  t.mock.method(console, 'info', line => {
    if (String(line).includes('[ObscuraPerf]')) lines.push(line);
  });
  const oldPerf = process.env.AUTOLEADPC_OBSCURA_PERF;
  const oldTimeout = process.env.OBSCURA_NAV_TIMEOUT_MS;
  process.env.AUTOLEADPC_OBSCURA_PERF = '1';
  process.env.OBSCURA_NAV_TIMEOUT_MS = '45000';
  t.after(() => {
    if (oldPerf === undefined) delete process.env.AUTOLEADPC_OBSCURA_PERF;
    else process.env.AUTOLEADPC_OBSCURA_PERF = oldPerf;
    if (oldTimeout === undefined) delete process.env.OBSCURA_NAV_TIMEOUT_MS;
    else process.env.OBSCURA_NAV_TIMEOUT_MS = oldTimeout;
  });
  let announceRequest;
  const incoming = new Promise(resolve => { announceRequest = resolve; });
  let posts = 0, stylesheet, finished = false;
  const endStylesheet = response => {
    response.writeHead(200, { 'content-type': 'text/css' });
    response.end('body{background:green}');
  };
  const server = http.createServer((request, response) => {
    if (request.url.startsWith('/slow') && request.method === 'POST') {
      posts++;
      announceRequest(response);
      return;
    }
    if (request.url === '/pending.css') {
      stylesheet = response;
      if (finished) endStylesheet(response);
      return;
    }
    response.setHeader('content-type', 'text/html');
    response.end(request.url === '/child' ? '<body style="background:blue">Child</body>' : '<body style="background:red">Parent</body>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  const session = await openObscuraBrowser({ slot: 984, port: 0, registerSession: false });
  t.after(() => session.close());
  const url = 'http://127.0.0.1:' + server.address().port;
  await session.page.goto(url);
  const child = await session.browser.newPage();
  await child.goto(url + '/child');
  const documentSession = await session.browser.newCDPSession(session.page);
  const settings = { format: 'jpeg', quality: 58, maxWidth: 1280, maxHeight: 800, everyNthFrame: 2 };
  const reference = await session.browser.newCDPSession(child);
  const childReference = new Promise(resolve => reference.once('Page.screencastFrame', resolve));
  await reference.send('Page.startScreencast', settings);
  const expected = (await childReference).data;
  await reference.detach();
  const rootReference = new Promise(resolve => documentSession.once('Page.screencastFrame', resolve));
  await documentSession.send('Page.startScreencast', settings);
  assert.notEqual((await rootReference).data, expected);

  const navigation = documentSession.send('Page.navigate', {
    url: url + '/slow?fixture-private-marker', __method: 'POST', __body: 'fixture=1'
  });
  const slowResponse = await incoming;
  const heldAt = performance.now();
  const releaseDocument = () => {
    if (!slowResponse.writableEnded) {
      slowResponse.writeHead(422, { 'content-type': 'text/html' });
      slowResponse.end('<link rel="stylesheet" href="/pending.css"><body>Complete</body>');
    }
  };
  // Giữ tổng thời gian tải 30s qua hai phản hồi, mỗi request vẫn dưới timeout HTTP thật.
  const documentTimer = holdMs ? setTimeout(releaseDocument, holdMs / 2) : null;
  const release = () => {
    finished = true;
    releaseDocument();
    if (stylesheet && !stylesheet.writableEnded) endStylesheet(stylesheet);
  };
  const safetyRelease = setTimeout(release, Math.max(holdMs, 3000) + 3000);
  try {
    const viewer = await session.browser.newCDPSession(child);
    await viewer.send('Page.enable');
    const first = new Promise(resolve => viewer.once('Page.screencastFrame', resolve));
    await viewer.send('Page.startScreencast', settings);
    const frame = await first;
    const firstMs = performance.now() - heldAt;
    assert.equal(frame.data, expected);
    await viewer.send('Page.screencastFrameAck', { sessionId: frame.sessionId });
    await viewer.send('Page.stopScreencast');
    await viewer.detach();
    await documentSession.send('Page.stopScreencast');
    const loadingViewer = await session.browser.newCDPSession(session.page);
    const committedFrame = new Promise(resolve => loadingViewer.once('Page.screencastFrame', resolve));
    await loadingViewer.send('Page.startScreencast', settings);
    assert.equal(slowResponse.writableEnded, false, 'Hoàn tất đổi nguồn trước khi nhận phản hồi POST');
    await new Promise(resolve => setTimeout(resolve, Math.max(0, holdMs - (performance.now() - heldAt))));
    assert.equal(finished, false, 'Đường thoát của fixture chưa kích hoạt');
    if (holdMs) assert.ok(stylesheet && !stylesheet.writableEnded, 'Tab chính vẫn chờ CSS');
    t.diagnostic(`Ảnh tab con sau ${firstMs.toFixed(1)} ms, điều hướng POST giữ ${(performance.now() - heldAt).toFixed(1)} ms`);
    assert.ok(firstMs < (holdMs ? 500 : 2500), 'Tab con phải có hình trong ngưỡng đo');
    release();
    await navigation;
    assert.notEqual((await committedFrame).data, expected);
    await loadingViewer.detach();
  } finally {
    clearTimeout(documentTimer);
    clearTimeout(safetyRelease);
    release();
    await navigation;
  }
  await session.close();
  assert.equal(posts, 1);
  assert.ok(lines.some(line => line.includes('view_during_navigation op=attach')));
  assert.ok(lines.some(line => line.includes('navigation_end id=') && line.includes('http_status=422')));
  assert.ok(lines.every(line => !line.includes('fixture-private-marker') && !line.includes(url)));
});
