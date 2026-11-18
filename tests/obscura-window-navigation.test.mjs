import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openObscuraBrowser, obscuraViewport } from '../src/obscura-engine/open-obscura-browser.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';
let available = true;
try { resolveObscuraBinary(); } catch { available = false; }

const documentHtml = `<!doctype html><html><head><title>Offline navigation</title></head><body>
<a id="cancel" href="/cancelled" target="_blank" onclick="event.preventDefault()">Cancel</a>
<a id="self" href="/same">Same tab</a>
<a id="blank" href="/child" target="_blank">New tab</a>
<form id="post" action="/post" method="post" target="_blank"><input name="answer" value="fixture"><button>Continue</button></form>
<form id="get" action="/get?old=discard" target="_blank"><input name="answer" value="fixture"><button>Continue</button></form>
<form id="cancelForm" action="/cancelled" target="_blank" onsubmit="event.preventDefault()"><button>Cancel submit</button></form>
<form id="override" action="/wrong"><input name="answer" value="override"><button id="submitOverride" formaction="/override" formmethod="post" formtarget="_blank" name="cta" value="yes">Override</button></form>
</body></html>`;

test('Obscura tuân theo target và sự kiện HTML, giữ nguyên request của form', { skip: !available, timeout: 90000 }, async t => {
  const requests = [];
  const server = http.createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push({ url: request.url, method: request.method, body });
    response.setHeader('Content-Type', 'text/html');
    response.end(request.url === '/root' ? documentHtml : '<!doctype html><html><head><script>window.firstViewport=[innerWidth,innerHeight]</script></head><body>Destination</body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let session;
  t.after(async () => { await session?.close(); await new Promise(resolve => server.close(resolve)); });
  session = await openObscuraBrowser({ slot: 986, port: 0, registerSession: false });
  const context = session.browser, page = session.page;
  page.setDefaultTimeout(3000);
  await page.goto(origin + '/root');

  await t.test('preventDefault của click và submit không mở tab', async () => {
    await page.locator('#cancel').click();
    await page.evaluate(() => document.getElementById('cancelForm').requestSubmit());
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(context.pages().length, 1);
    assert.ok(!requests.some(request => request.url === '/cancelled'));
  });
  await t.test('POST và GET giữ body/query, submitter override được giữ', async () => {
    for (const [formId, expected] of [
      ['post', { url: '/post', method: 'POST', body: 'answer=fixture' }],
      ['get', { url: '/get?answer=fixture', method: 'GET', body: '' }],
      ['override', { url: '/override', method: 'POST', body: 'answer=override&cta=yes' }],
    ]) {
      if (formId === 'override') await page.locator('#submitOverride').click();
      else await page.evaluate(id => document.getElementById(id).requestSubmit(), formId);
      await assertEventually(() => requests.some(request => request.url === expected.url), `request ${expected.url}`);
      assert.deepEqual(requests.find(request => request.url === expected.url), expected);
    }
  });
  await t.test('link không target và window.open _self điều hướng tab cha', async () => {
    const count = context.pages().length;
    await page.locator('#self').click();
    await assertEventually(async () => await page.evaluate(() => location.href).catch(() => '') === origin + '/same', 'same-tab anchor');
    await page.evaluate(() => window.open('/self', '_self'));
    await assertEventually(async () => await page.evaluate(() => location.href).catch(() => '') === origin + '/self', 'window.open _self');
    assert.equal(context.pages().length, count);
    await page.goto(origin + '/root');
  });
  await t.test('base href và target blank tuân theo HTML', async () => {
    await page.evaluate(() => { const base = document.createElement('base'); base.href = '/base/'; document.head.appendChild(base); document.getElementById('blank').setAttribute('href', 'relative'); });
    await page.locator('#blank').click();
    await assertEventually(() => requests.some(request => request.url === '/base/relative'), 'relative base URL');
  });
  await t.test('Rust phát popup/opener thật qua CDP và tab noopener tự đóng được', async () => {
    const popup = page.waitForEvent('popup', { timeout: 3000 });
    await page.evaluate(() => window.open('/native-popup', '_blank'));
    const child = await popup;
    assert.equal(await child.opener(), page);
    await assertEventually(async () => await child.evaluate(() => location.href).catch(() => '') === origin + '/native-popup', 'popup loaded');
    assert.deepEqual(await child.evaluate(() => window.firstViewport), Object.values(obscuraViewport(session.profile)));
    await child.evaluate(() => window.close()).catch(error => { if (!/closed|destroyed/.test(error.message)) throw error; });
    await assertEventually(() => child.isClosed(), 'native window.close');
    const count = context.pages().length;
    await page.locator('#blank').click();
    await assertEventually(() => context.pages().length === count + 1, 'noopener child');
    const detached = context.pages().findLast(child => child.url() === origin + '/base/relative');
    assert.ok(detached);
    assert.equal(await detached.evaluate(() => opener === null), true);
    await detached.evaluate(() => window.close()).catch(error => { if (!/closed|destroyed/.test(error.message)) throw error; });
    await assertEventually(() => detached.isClosed(), 'noopener window.close');
  });
  await t.test('iframe có tên, _parent và _top không tạo tab ngoài', async () => {
    await page.goto(origin + '/root');
    const count = context.pages().length;
    await page.evaluate(() => { const frame = document.createElement('iframe'); frame.name = 'offerFrame'; frame.src = '/frame'; document.body.appendChild(frame); });
    await assertEventually(() => page.frames().some(frame => frame.url() === origin + '/frame'), 'iframe ready');
    await page.evaluate(() => window.open('/frame-next', 'offerFrame'));
    await assertEventually(() => page.frames().some(frame => frame.url() === origin + '/frame-next'), 'named iframe target');
    const frame = page.frames().find(frame => frame.url() === origin + '/frame-next');
    await frame.evaluate(() => window.open('/parent-next', '_parent'));
    await assertEventually(async () => await page.evaluate(() => location.href).catch(() => '') === origin + '/parent-next', 'parent target');
    assert.equal(context.pages().length, count);
    await page.goto(origin + '/root');
  });
  await t.test('target có tên tái dùng tab và reference điều hướng/đóng được', async () => {
    const count = context.pages().length;
    assert.equal(await page.evaluate(() => { window.childReference = window.open('/named-one', 'offerWindow'); return window.childReference === null; }), false);
    await assertEventually(() => context.pages().some(child => child.url() === origin + '/named-one'), 'named window');
    assert.equal(await page.evaluate(() => window.childReference === window.open('/named-two', 'offerWindow')), true);
    await assertEventually(() => context.pages().some(child => child.url() === origin + '/named-two'), 'reused named window');
    assert.equal(context.pages().length, count + 1);
    const child = context.pages().find(child => child.url() === origin + '/named-two');
    assert.equal(await child.evaluate(() => opener !== null), true);
    await page.evaluate(() => { window.childReference.location = '/reference'; });
    await assertEventually(() => child.url() === origin + '/reference', 'reference navigation');
    await child.evaluate(() => { window.received = null; addEventListener('message', event => { window.received = event.data; }); });
    await page.evaluate(() => window.childReference.postMessage('offline message', location.origin));
    await assertEventually(async () => await child.evaluate(() => window.received) === 'offline message', 'postMessage');
    await page.evaluate(() => window.childReference.close());
    await assertEventually(() => child.isClosed(), 'reference close');
    assert.equal(await page.evaluate(() => window.childReference.closed), true);
  });
});

/**
 * Chờ bằng chứng quan sát được từ server/tab thay vì giả định popup hoàn tất sau một delay cố định.
 * @param {Function} predicate Điều kiện quan sát đồng bộ hoặc bất đồng bộ.
 * @param {string} label Nội dung lỗi khi hết hạn.
 * @return {Promise<void>} Điều kiện đã đúng.
 * @throws {AssertionError} Khi không đạt điều kiện trong 5 giây.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
async function assertEventually(predicate, label) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(label);
}
