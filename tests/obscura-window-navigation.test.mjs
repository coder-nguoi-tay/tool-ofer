import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openObscuraBrowser, obscuraViewport } from '../src/obscura-engine/open-obscura-browser.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';
import { selectActiveForm } from '../src/autofill/form-scope/select-active-form.mjs';
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

/**
 * Xác minh nhận diện form vẫn hoạt động khi trang freeze wrapper body và đổi cây DOM.
 * @param {import('node:test').TestContext} t Quản lý phiên thử nghiệm cô lập.
 * @return {Promise<void>} Hoàn tất kiểm tra DOM và phạm vi form.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
test('Obscura nhận diện form trong DOM bị freeze sau khi thay đổi cây', { skip: !available, timeout: 30000 }, async t => {
  const session = await openObscuraBrowser({ slot: 987, port: 0, registerSession: false });
  t.after(() => session.close());
  const page = session.page;
  await page.goto('data:text/html,<!doctype html><html><body><form id="signup"><input type="email" name="email"><button>Continue</button></form></body></html>');
  const result = await page.evaluate(() => {
    const body = document.body;
    const input = document.querySelector('input');
    // Prime cả cache cha/kết nối trước khi freeze và làm mất hiệu lực cache.
    void body.parentNode;
    void body.isConnected;
    Object.freeze(body);
    Object.seal(input);
    const marker = document.createElement('div');
    document.documentElement.appendChild(marker);
    let visibleAncestors = 0;
    for (let parent = input; parent; parent = parent.parentElement) {
      if (getComputedStyle(parent).display !== 'none') visibleAncestors++;
    }
    body.appendChild(document.createElement('span'));
    return { connected: body.isConnected, parent: body.parentNode.tagName, visibleAncestors, frozen: Object.isFrozen(body) };
  });
  assert.deepEqual(result, { connected: true, parent: 'HTML', visibleAncestors: 4, frozen: true });
  const scope = await page.evaluate(selectActiveForm, { nextId: 'frozen-form-regression' });
  assert.equal(scope?.active, true);
  assert.equal(scope?.visibleFieldCount, 1);
  assert.equal(scope?.nativeForm, true);
});

test('Obscura phân biệt timeout trước header, giữa body và tài nguyên con quá hạn', { skip: !available, timeout: 45000 }, async t => {
  const originalTimeout = process.env.OBSCURA_NAV_TIMEOUT_MS;
  const originalPerf = process.env.AUTOLEADPC_OBSCURA_PERF;
  process.env.OBSCURA_NAV_TIMEOUT_MS = '2000';
  process.env.AUTOLEADPC_OBSCURA_PERF = '1';
  t.after(() => {
    if (originalTimeout === undefined) delete process.env.OBSCURA_NAV_TIMEOUT_MS;
    else process.env.OBSCURA_NAV_TIMEOUT_MS = originalTimeout;
    if (originalPerf === undefined) delete process.env.AUTOLEADPC_OBSCURA_PERF;
    else process.env.AUTOLEADPC_OBSCURA_PERF = originalPerf;
  });

  const transfers = [];
  t.mock.method(console, 'info', line => {
    if (String(line).includes('[ObscuraPerf] navigation_end ')) transfers.push(line);
  });
  const requests = [];
  const server = http.createServer((req, res) => {
    const path = req.url.split('?')[0];
    requests.push([path, req.method]);
    if (path === '/headers' || path === '/pending.css' || path === '/pending.js') return;
    if (path === '/ready.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end('#probe { width: 77px }');
      return;
    }
    if (path === '/ready.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end('window.externalScriptRan = true');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (path === '/body') { res.write('<!doctype html>'); return; }
    const asset = path === '/css' ? '<link rel="stylesheet" href="/pending.css"><link rel="stylesheet" href="/ready.css">'
      : path === '/script' ? '<script src="/pending.js"></script><script src="/ready.js"></script>' : '';
    res.end('<!doctype html><title>Committed page</title>' + asset + '<div id="probe"></div><script>window.fixtureReady = true</script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  let session;
  t.after(async () => {
    await session?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  session = await openObscuraBrowser({ slot: 964, port: 0, registerSession: false });
  await session.page.goto(origin + '/root');
  const cdp = await session.browser.newCDPSession(session.page);
  await cdp.send('Page.enable');
  const commits = [], failures = [];
  cdp.on('Page.frameNavigated', event => commits.push(event.frame.url));
  cdp.on('Network.loadingFailed', event => failures.push(event));

  for (const phase of ['headers', 'body']) {
    await t.test('POST chờ ' + phase, async () => {
      commits.length = 0;
      failures.length = 0;
      const url = origin + '/' + phase + '?fixture-private-marker';
      const before = transfers.length;
      await assert.rejects(cdp.send('Page.navigate', { url, __method: 'POST', __body: '' }), /deadline|timed out/i);
      await assertEventually(() => transfers.slice(before).some(line => line.includes('failed=1')), 'mốc lỗi điều hướng');
      const trace = transfers.slice(before).find(line => line.includes('failed=1'));
      assert.ok(trace.includes('phase=' + phase), trace);
      assert.ok(trace.includes('http_status=' + (phase === 'headers' ? 0 : 200) + ' '), trace);
      assert.match(trace, /request_ms=\d+/);
      assert.match(trace, phase === 'headers' ? /headers_ms=-1 / : /headers_ms=\d+ /);
      assert.match(trace, /body_ms=-1$/);
      assert.ok(!trace.includes('fixture-private-marker') && !trace.includes(origin));
      assert.deepEqual(requests.filter(([path]) => path === '/' + phase), [['/' + phase, 'POST']]);
      assert.ok(!commits.includes(url));
      assert.equal((await cdp.send('Page.getFrameTree')).frameTree.frame.url, origin + '/root');
      assert.equal(await session.page.evaluate(() => window.fixtureReady), true);
      assert.deepEqual(failures.filter(event => event.type === 'Document').map(event => event.errorText), ['net::ERR_TIMED_OUT']);
    });
  }
  for (const [path, type] of [['css', 'Stylesheet'], ['script', 'Script']]) {
    await t.test('HTML 200 vẫn hoàn tất khi ' + type + ' hết hạn', async () => {
      failures.length = 0;
      const destination = origin + '/' + path;
      await cdp.send('Page.navigate', { url: destination });
      await assertEventually(() => session.page.evaluate(
        expected => location.href === expected && window.fixtureReady === true, destination,
      ).catch(error => {
        if (/execution context was destroyed/i.test(error.message)) return false;
        throw error;
      }), 'Document đích phải chạy xong script của fixture');
      assert.equal((await cdp.send('Page.getFrameTree')).frameTree.frame.url, origin + '/' + path);
      if (path === 'css') {
        assert.equal(await session.page.evaluate(() => getComputedStyle(document.getElementById('probe')).width), '77px');
      } else {
        assert.equal(await session.page.evaluate(() => window.externalScriptRan), true);
      }
      assert.ok(failures.some(event => event.type === type), 'Tài nguyên chậm phải được ghi nhận lỗi');
    });
  }
});

test('tab gốc vẫn chạy timer, evaluate và click trong lúc popup chờ header/ảnh chậm', { skip: !available, timeout: 90000 }, async t => {
  // Tái hiện câu hỏi linkout Alpha Intent (2026-11-21): onclick tự window.open(_blank) rồi đổi câu sau 100ms.
  const opener = `<!doctype html><html><body><div id="card"><a id="cta" href="/slow-popup" style="display:block;width:300px;height:60px"
    onclick="event.preventDefault(); window.open(this.href, '_blank'); setTimeout(() => { document.getElementById('card').textContent = 'NEXT QUESTION'; }, 100)">See If I Qualify</a></div></body></html>`;
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/root') return response.end(opener);
    if (request.url === '/slow-popup') return setTimeout(() => response.end('<!doctype html><body>Offer<img src="/slow.png"></body>'), 4000);
    if (request.url === '/slow.png') return setTimeout(() => { response.setHeader('Content-Type', 'image/png'); response.end(); }, 4000);
    response.end('<!doctype html><body>ok</body>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let session;
  t.after(async () => { await session?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  session = await openObscuraBrowser({ slot: 985, port: 0, registerSession: false });
  const { page, browser: context } = session;
  await page.goto(origin + '/root');
  const box = await page.locator('#cta').boundingBox();
  const cdp = await context.newCDPSession(page);
  // Cùng đường với click tay của Screen View.
  for (const type of ['mousePressed', 'mouseReleased']) {
    await cdp.send('Input.dispatchMouseEvent', { type, x: box.x + 20, y: box.y + 20, button: 'left', clickCount: 1 });
  }
  const clickedAt = Date.now();
  await assertEventually(() => context.pages().length === 2, 'popup được tạo');
  await assertEventually(async () => await page.evaluate(() => document.getElementById('card').textContent) === 'NEXT QUESTION', 'tab gốc đổi câu');
  assert.ok(Date.now() - clickedAt < 2000, `tab gốc đổi câu sau ${Date.now() - clickedAt}ms, popup còn đang chờ header`);
  const started = Date.now();
  assert.equal(await page.evaluate(() => 1 + 1), 2);
  assert.ok(Date.now() - started < 1000, 'evaluate của tab gốc không bị hoãn tới khi popup tải xong');
  const popup = context.pages().find(candidate => candidate !== page);
  // Popup cần 4s header + tối đa 2 lượt warmup ảnh 1s: chờ lâu hơn hạn 5s của assertEventually.
  const deadline = Date.now() + 15000;
  let popupText = '';
  while (Date.now() < deadline && !popupText.includes('Offer')) {
    popupText = await popup.evaluate(() => document.body.innerText).catch(() => '');
    if (!popupText.includes('Offer')) await new Promise(resolve => setTimeout(resolve, 200));
  }
  assert.ok(popupText.includes('Offer'), 'popup vẫn tải xong');
});

test('stylesheet <link> trong HTML của iframe được tải và áp dụng (ô ẩn bằng CSS ngoài vẫn ẩn)', { skip: !available, timeout: 60000 }, async t => {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push(request.url);
    if (request.url.endsWith('.css')) { response.setHeader('Content-Type', 'text/css'); return response.end('#label{color:rgb(25,26,27)} .step-hidden{display:none}'); }
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/root') return response.end('<!doctype html><body><iframe id="outer" src="/frame"></iframe></body>');
    if (request.url === '/frame') return response.end('<!doctype html><html><head><link rel="stylesheet" href="/frame.css"></head><body><p id="label">Email</p><input id="honeypot" class="step-hidden"><iframe src="/nested"></iframe><script>document.querySelector("link").addEventListener("load", () => { window.cssLoadEvent = 1; });</script></body></html>');
    if (request.url === '/nested') return response.end('<!doctype html><link rel="stylesheet" href="/nested.css"><body><p id="label">nested</p></body>');
    response.end('');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let session;
  t.after(async () => { await session?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  session = await openObscuraBrowser({ slot: 982, port: 0, registerSession: false });
  await session.page.goto(origin + '/root');
  const frame = path => session.page.frames().find(candidate => candidate.url() === origin + path);
  await assertEventually(async () => await frame('/frame')?.evaluate(() => getComputedStyle(document.getElementById('label')).color).catch(() => '') === 'rgb(25, 26, 27)', 'CSS của iframe');
  assert.deepEqual(await frame('/frame').evaluate(() => [getComputedStyle(document.getElementById('honeypot')).display, document.styleSheets.length, window.cssLoadEvent]), ['none', 1, 1]);
  await assertEventually(async () => await frame('/nested')?.evaluate(() => getComputedStyle(document.getElementById('label')).color).catch(() => '') === 'rgb(25, 26, 27)', 'CSS của iframe lồng');
  assert.equal(requests.filter(url => url === '/frame.css').length, 1, 'mỗi stylesheet chỉ tải một lần');
});

test('lệnh chuyển trang mới huỷ lần đang treo; input vào tab đang tải không bị phát lại lên trang mới', { skip: !available, timeout: 90000 }, async t => {
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/hang' || request.url === '/hang-again') return; // server treo như offer lỗi
    if (request.url === '/slow') return setTimeout(() => response.end('<!doctype html><body><h1 id="t">slow</h1></body>'), 3000);
    if (request.url === '/target') return response.end('<!doctype html><body style="margin:0"><button id="b" style="width:400px;height:400px" onclick="window.clicks=(window.clicks||0)+1">B</button><h1 id="t">target</h1></body>');
    response.end(`<!doctype html><body><h1 id="t">${request.url.slice(1)}</h1></body>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let session;
  t.after(async () => { await session?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  session = await openObscuraBrowser({ slot: 981, port: 0, registerSession: false });
  const page = session.page;
  const title = () => page.evaluate(() => document.getElementById('t')?.textContent);

  // Giống F5 của app: goto hết hạn phía client, lần goto sau không được xếp hàng sau lần treo (hạn engine 30s).
  await assert.rejects(page.goto(origin + '/hang', { timeout: 2000 }));
  let started = Date.now();
  await page.goto(origin + '/after-hang', { timeout: 5000 });
  assert.equal(await title(), 'after-hang');
  assert.ok(Date.now() - started < 3000, `goto sau trang treo mất ${Date.now() - started}ms`);

  // Lần sau thắng lần trước đang chậm, trang chậm không được ghi đè.
  const slow = page.goto(origin + '/slow').catch(error => error);
  await new Promise(resolve => setTimeout(resolve, 300));
  await page.goto(origin + '/winner', { timeout: 5000 });
  assert.ok(await slow instanceof Error, 'goto bị thay thế phải báo lỗi như Chrome');
  await new Promise(resolve => setTimeout(resolve, 3500));
  assert.equal(await title(), 'winner');

  // Click gửi khi tab đang tải được trả lời ngay và không rơi xuống nút của trang mới.
  const cdp = await session.browser.newCDPSession(page);
  const navigation = cdp.send('Page.navigate', { url: origin + '/target-slow' }).catch(() => {});
  server.removeAllListeners('request');
  server.on('request', (request, response) => {
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/target-slow') return setTimeout(() => response.end('<!doctype html><body style="margin:0"><button id="b" style="width:400px;height:400px" onclick="window.clicks=(window.clicks||0)+1">B</button><h1 id="t">target</h1></body>'), 2000);
    response.end('');
  });
  await new Promise(resolve => setTimeout(resolve, 300));
  started = Date.now();
  for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: 100, y: 100, button: 'left', clickCount: 1 });
  assert.ok(Date.now() - started < 500, `click lúc đang tải bị giữ ${Date.now() - started}ms`);
  await navigation;
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await title(), 'target');
  assert.equal(await page.evaluate(() => window.clicks || 0), 0, 'click cũ không được bấm lên trang mới');
});

test('link #anchor cuộn tới phần tử đích như Chrome', { skip: !available, timeout: 60000 }, async t => {
  const session = await openObscuraBrowser({ slot: 980, port: 0, registerSession: false });
  t.after(() => session.close());
  const page = session.page;
  await page.goto('data:text/html,<!doctype html><body style="margin:0"><a id="go" href="%23sec%C3%A9">go</a> <a id="name" href="%23legacy">name</a> <a id="to-top" href="%23top">top</a><div style="height:3000px"></div><p id="secé">here</p><div style="height:3000px"></div><a name="legacy">legacy</a><div style="height:3000px"></div></body>');
  const y = () => page.evaluate(() => Math.round(scrollY));
  await page.evaluate(() => document.getElementById('go').click());
  assert.ok(Math.abs(await y() - await page.evaluate(() => Math.round(document.getElementById('secé').getBoundingClientRect().top + scrollY))) <= 1 && await y() > 2000, `id đích, scrollY=${await y()}`);
  await page.evaluate(() => document.getElementById('name').click());
  assert.ok(await y() > 5000, `a[name], scrollY=${await y()}`);
  await page.evaluate(() => document.getElementById("to-top").click());
  assert.equal(await y(), 0);
});

test('điều hướng lỗi/tải tệp không thay trang hiện tại và không làm hỏng lần goto sau', { skip: !available, timeout: 60000 }, async t => {
  const server = http.createServer((request, response) => {
    if (request.url === '/hang') return;
    if (request.url === '/empty-500') { response.writeHead(500); return response.end(); }
    if (request.url === '/download') { response.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="a.bin"' }); return response.end('binary'); }
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><h1 id="t">${request.url.slice(1)}</h1>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let session;
  t.after(async () => { await session?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  session = await openObscuraBrowser({ slot: 978, port: 0, registerSession: false });
  const page = session.page;
  const title = () => page.evaluate(() => document.getElementById('t')?.textContent);
  await page.goto(origin + '/start');
  await assert.rejects(page.goto(origin + '/empty-500'));
  assert.equal(page.url(), origin + '/start', 'lỗi 500 rỗng giữ trang cũ');
  await assert.rejects(page.goto(origin + '/hang', { timeout: 1500 }));
  await page.goto(origin + '/linked', { timeout: 5000 });
  assert.equal(await title(), 'linked');
  await page.evaluate(url => { location.href = url; }, origin + '/download');
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal(await title(), 'linked', 'tệp tải về không thay trang');
  assert.equal(page.url(), origin + '/linked');
});

test('Screen View vẽ lại khi chỉ nội dung bên trong iframe thay đổi', { skip: !available, timeout: 60000 }, async t => {
  const { createHash } = await import('node:crypto');
  const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/child') return response.end('<!doctype html><body style="margin:0;background:rgb(0,160,0);font:40px sans-serif"><p id="n">0</p><script>let i=0;setInterval(()=>{document.body.style.background=++i%2?"rgb(200,0,0)":"rgb(0,160,0)";document.getElementById("n").textContent=i},500)</script></body>');
    response.end('<!doctype html><body style="margin:0"><iframe src="/child" style="width:400px;height:200px;border:0"></iframe></body>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let session;
  t.after(async () => { await session?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  session = await openObscuraBrowser({ slot: 975, port: 0, registerSession: false });
  await session.page.goto(origin + '/root');
  const cdp = await session.browser.newCDPSession(session.page);
  const frames = new Set();
  cdp.on('Page.screencastFrame', frame => {
    frames.add(createHash('md5').update(frame.data).digest('hex'));
    cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
  });
  await cdp.send('Page.enable');
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 58, maxWidth: 800, maxHeight: 600 });
  await new Promise(resolve => setTimeout(resolve, 2500));
  await cdp.send('Page.stopScreencast');
  assert.ok(frames.size >= 3, `chỉ có ${frames.size} khung hình khác nhau khi iframe đổi màu 4 lần`);
});

test('Screen View hiện trang mới trước khi script và tài nguyên chậm tải xong', { skip: !available, timeout: 60000 }, async t => {
  const { createHash } = await import('node:crypto');
  const server = http.createServer((request, response) => {
    if (request.url === '/slow.js') return setTimeout(() => { response.setHeader('Content-Type', 'text/javascript'); response.end('window.late = 1'); }, 3000);
    response.setHeader('Content-Type', 'text/html');
    if (request.url === '/next') return response.end('<!doctype html><body style="margin:0;background:rgb(0,0,200)"><h1>Next question</h1><script src="/slow.js"></script></body>');
    response.end('<!doctype html><body style="margin:0;background:rgb(255,255,255)"><h1>start</h1></body>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let session;
  t.after(async () => { await session?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  session = await openObscuraBrowser({ slot: 974, port: 0, registerSession: false });
  await session.page.goto(origin + '/start');
  const cdp = await session.browser.newCDPSession(session.page);
  const frames = [];
  cdp.on('Page.screencastFrame', frame => {
    frames.push({ at: Date.now(), hash: createHash('md5').update(frame.data).digest('hex') });
    cdp.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
  });
  await cdp.send('Page.enable');
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 58, maxWidth: 800, maxHeight: 600 });
  await new Promise(resolve => setTimeout(resolve, 600));
  const startHash = frames.at(-1)?.hash;
  const navigatedAt = Date.now();
  const navigation = cdp.send('Page.navigate', { url: origin + '/next' });
  await new Promise(resolve => setTimeout(resolve, 1500));
  const early = frames.filter(frame => frame.at > navigatedAt && frame.hash !== startHash);
  await navigation;
  await cdp.send('Page.stopScreencast');
  assert.ok(early.length > 0, 'Screen View vẫn giữ trang cũ trong lúc script cuối body đang tải');
  assert.ok(early[0].at - navigatedAt < 1500, `khung hình trang mới đầu tiên sau ${early[0]?.at - navigatedAt}ms`);
});
