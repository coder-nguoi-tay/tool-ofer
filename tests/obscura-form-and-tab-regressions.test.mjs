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
});

