import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { findFreePort } from '../src/obscura-engine/find-free-port.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';
import { startObscuraSession } from '../src/obscura-engine/start-obscura-session.mjs';
import { stopObscuraSession } from '../src/obscura-engine/stop-obscura-session.mjs';

let available = true;
try { resolveObscuraBinary(); } catch { available = false; }

/**
 * Đợi hai kênh loopback và CDP nhận đủ sự kiện mà không nhả phản hồi HTTP đang giữ.
 * @param {() => boolean} received Kiểm tra dấu hiệu mong đợi.
 * @param {string} description Mô tả dấu hiệu để chẩn đoán khi hết thời gian.
 * @return {Promise<void>} Hoàn tất khi probe đã quan sát được.
 * @throws {AssertionError} Nếu hết 5 giây vẫn chưa quan sát được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function waitForObservation(received, description) {
  const deadline = Date.now() + 5000;
  while (!received() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok(received(), description);
}

/**
 * Giữ hai phản hồi ở máy chủ để kiểm tra định danh frame và sự kiện bắt đầu trước khi có dữ liệu.
 * @param {object} t Ngữ cảnh test để dọn server, tiến trình và kết nối riêng.
 * @return {Promise<void>} Hoàn tất khi cả chế độ quan sát và bắt request đều đúng thứ tự.
 * @throws {Error} Khi thiếu sự kiện, phát trùng hoặc gán sai frame.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function verifyFrameNetworkEvents(t) {
  const childPaths = ['/child-1', '/child-2'];
  const heldPaths = new Set([...childPaths, '/child-blank', '/data', '/xhr']);
  const responses = new Map();
  const server = http.createServer((request, response) => {
    if (request.url === '/') response.writeHead(200, {'Content-Type': 'text/html'}).end('<main>Local frame fixture</main>');
    else if (request.url === '/child-failed') response.destroy();
    else if (heldPaths.has(request.url)) responses.set(request.url, response);
    else response.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origin = 'http://127.0.0.1:' + server.address().port;
  t.after(() => { server.closeAllConnections(); server.close(); });
  const engine = await startObscuraSession({port: await findFreePort(0)});
  t.after(() => stopObscuraSession(engine.process));
  const browser = await chromium.connectOverCDP(engine.cdpEndpoint);
  for (const intercept of [false, true]) {
    const context = browser.contexts()[0];
    const page = await context.newPage();
    try {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      const starts = new Map();
      const completions = new Map();
      const failures = [];
      cdp.on('Network.responseReceived', event => completions.set(event.requestId, event.frameId));
      cdp.on('Network.loadingFailed', event => failures.push(event.requestId));
      cdp.on('Network.requestWillBeSent', event => {
        if (!event.request.url.startsWith(origin + '/child-')) return;
        const key = new URL(event.request.url).pathname;
        assert.ok(!starts.has(key), 'Mỗi request chỉ bắt đầu một lần');
        starts.set(key, event);
      });
      if (!intercept) {
        const pending = page.waitForRequest(origin + '/child-blank', {timeout: 5000});
        pending.catch(() => {});
        await page.evaluate(url => {
          const iframe = document.createElement('iframe');
          iframe.src = url;
          document.body.appendChild(iframe);
        }, origin + '/child-blank');
        assert.equal((await pending).frame().parentFrame(), page.mainFrame());
        await waitForObservation(() => responses.has('/child-blank') && starts.has('/child-blank'),
          'Cả mạng và phiên CDP đều thấy request ở tab trắng trước lần điều hướng đầu');
        const blankFinished = page.waitForEvent('requestfinished', {
          predicate: request => request.url() === origin + '/child-blank', timeout: 5000,
        });
        responses.get('/child-blank').writeHead(200, {'Content-Type': 'text/html'}).end('<p>Ready</p>');
        responses.delete('/child-blank');
        await blankFinished;
      }
      await page.goto(origin);
      if (intercept) await page.route('**/*', route => route.request().url() === origin + '/child-failed'
        ? route.abort('connectionfailed') : route.continue());
      const parentData = page.waitForRequest(origin + '/data', {timeout: 5000});
      const dataResult = page.evaluate(async () => (await fetch('/data')).text());
      dataResult.catch(() => {});
      const dataRequest = await parentData;
      assert.equal(dataRequest.frame(), page.mainFrame());
      await waitForObservation(() => responses.has('/data'), 'Thấy fetch trước khi máy chủ trả kết quả');
      responses.get('/data').writeHead(200).end('data');
      responses.delete('/data');
      assert.equal(await dataResult, 'data');
      const frameRequests = childPaths.map(path => page.waitForRequest(origin + path, {timeout: 5000}));
      const terminal = childPaths.map(path => page.waitForEvent('requestfinished', {
        predicate: request => request.url() === origin + path, timeout: 6000,
      }));
      const finished = Promise.all(terminal);
      finished.catch(() => {});
      await page.evaluate(paths => {
        for (const path of paths) {
          const frame = document.createElement('iframe');
          frame.src = path;
          document.body.appendChild(frame);
        }
      }, childPaths);
      const requests = await Promise.all(frameRequests);
      await waitForObservation(() => childPaths.every(path => starts.has(path) && responses.has(path)),
        'Cả hai iframe đang đợi phản hồi');
      assert.equal(new Set(childPaths.map(path => starts.get(path).frameId)).size, childPaths.length);
      for (const request of requests) assert.equal(request.frame().parentFrame(), page.mainFrame());
      // Open a second protocol session only after both transports are already pending.
      const later = await context.newCDPSession(page);
      const announced = new Set();
      const committed = new Set();
      later.on('Page.frameAttached', ({frameId}) => {
        assert.ok(!announced.has(frameId), 'Mỗi frame tạm chỉ được báo attach một lần');
        announced.add(frameId);
      });
      later.on('Page.frameNavigated', ({frame}) => {
        if (frame.parentId) {
          assert.ok(announced.has(frame.id), 'Phiên CDP vừa gắn nhận attach trước commit');
          committed.add(frame.id);
        }
      });
      await later.send('Page.enable');
      const {frameTree} = await later.send('Page.getFrameTree');
      const expectedIds = childPaths.map(path => starts.get(path).frameId);
      assert.deepEqual(new Set((frameTree.childFrames || []).map(({frame}) => frame.id)), new Set(expectedIds));
      for (const path of childPaths) {
        responses.get(path).writeHead(200, {'Content-Type': 'text/html'}).end('<p>' + path + '</p>');
        responses.delete(path);
      }
      await finished;
      for (const [index, request] of requests.entries()) {
        const path = childPaths[index];
        const url = origin + path;
        await page.waitForFunction(expected => Array.from(document.querySelectorAll('iframe'))
          .some(frame => frame.contentDocument?.URL === expected), url, {timeout: 5000});
        assert.equal(request.frame().url(), url);
        const started = starts.get(path);
        await waitForObservation(() => completions.has(started.requestId), 'Phiên CDP nhận được response của ' + path);
        assert.equal(completions.get(started.requestId), started.frameId);
      }
      await waitForObservation(() => expectedIds.every(id => committed.has(id)), 'Phiên gắn muộn quan sát được commit của cả hai frame');
      for (const status of [204, 205]) {
        const path = '/child-empty-' + status;
        heldPaths.add(path);
        await page.evaluate(src => {
          const element = document.createElement('iframe');
          element.src = src;
          document.body.appendChild(element);
        }, path);
        await waitForObservation(() => starts.has(path) && responses.has(path), 'Có request iframe chờ HTTP ' + status);
        const pending = starts.get(path);
        const removed = new Set();
        const onDetached = event => removed.add(event.frameId);
        later.on('Page.frameDetached', onDetached);
        responses.get(path).writeHead(status).end();
        responses.delete(path);
        await waitForObservation(() => removed.has(pending.frameId) && completions.has(pending.requestId),
          'HTTP ' + status + ' thu hồi frame tạm và kết thúc request');
        later.off('Page.frameDetached', onDetached);
        const after = await later.send('Page.getFrameTree');
        assert.ok(!after.frameTree.childFrames?.some(({frame}) => frame.id === pending.frameId));
      }
      const cancelledPath = '/child-cancelled';
      heldPaths.add(cancelledPath);
      const detached = new Set();
      later.on('Page.frameDetached', ({frameId}) => detached.add(frameId));
      await page.evaluate(src => {
        const element = document.createElement('iframe');
        element.id = 'cancelled-child';
        element.src = src;
        document.body.appendChild(element);
      }, cancelledPath);
      await waitForObservation(() => starts.has(cancelledPath) && responses.has(cancelledPath), 'Iframe có request cần hủy');
      const cancelled = starts.get(cancelledPath);
      await page.evaluate(() => document.getElementById('cancelled-child').remove());
      await waitForObservation(() => failures.includes(cancelled.requestId) && detached.has(cancelled.frameId),
        'Tháo iframe kết thúc request và thu hồi thông báo attach');
      responses.delete(cancelledPath);
      const remaining = await later.send('Page.getFrameTree');
      assert.ok(!remaining.frameTree.childFrames?.some(({frame}) => frame.id === cancelled.frameId));
      await later.detach();
      const child = requests[0].frame();
      const childData = page.waitForRequest(origin + '/xhr', {timeout: 5000});
      const xhrResult = child.evaluate(() => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/xhr');
        xhr.onload = () => resolve(xhr.responseText);
        xhr.onerror = reject;
        xhr.send();
      }));
      xhrResult.catch(() => {});
      assert.equal((await childData).frame(), child);
      await waitForObservation(() => responses.has('/xhr'), 'Thấy XHR của iframe khi còn pending');
      responses.get('/xhr').writeHead(200).end('child data');
      responses.delete('/xhr');
      assert.equal(await xhrResult, 'child data');
      const failedRequest = page.waitForEvent('requestfailed', {
        predicate: request => request.url() === origin + '/child-failed', timeout: 5000,
      });
      failedRequest.catch(() => {});
      await page.evaluate(() => {
        const iframe = document.createElement('iframe');
        iframe.src = '/child-failed';
        document.body.appendChild(iframe);
      });
      assert.ok((await failedRequest).failure());
      await waitForObservation(() => starts.has('/child-failed'), 'Phiên CDP nhận được request bắt đầu trước lỗi');
      const failedStart = starts.get('/child-failed');
      await waitForObservation(() => failures.includes(failedStart.requestId), 'CDP phải báo lỗi cho cùng request');
      assert.equal(failures.filter(requestId => requestId === failedStart.requestId).length, 1);
      await cdp.detach();
    } finally { await page.close(); }
  }
}
test('Obscura phát request của hai iframe khi mạng còn pending và giữ đúng frame tới lúc hoàn tất',
  {skip: !available, timeout: 30000}, verifyFrameNetworkEvents);

/**
 * Theo dõi yêu cầu script thật trước response và kết thúc fetch còn dở khi thay tài liệu.
 * @param {object} t Ngữ cảnh kiểm thử để dọn tiến trình và máy chủ cục bộ.
 * @return {Promise<void>} Hoàn tất khi hai request nhận sự kiện đúng một lần.
 * @throws {Error} Khi trình duyệt bỏ sót sự kiện hoặc báo lặp sau khi đổi trang.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function verifyDocumentRequestOwnership(t) {
  const responses = new Map();
  const server = http.createServer((request, response) => {
    if (['/a', '/b'].includes(request.url)) response.writeHead(200, {'Content-Type':'text/html'}).end('<p>local fixture</p>');
    else if (['/dynamic.js', '/pending'].includes(request.url)) responses.set(request.url, response);
    else response.writeHead(404).end();
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const engine = await startObscuraSession({port: await findFreePort(0)});
  t.after(() => stopObscuraSession(engine.process));
  const browser = await chromium.connectOverCDP(engine.cdpEndpoint);
  const context = browser.contexts()[0];
  const page = await context.newPage();
  try {
    const cdp = await context.newCDPSession(page);
    const requests = new Map();
    const finished = [];
    const failed = [];
    cdp.on('Network.requestWillBeSent', event => requests.set(event.request.url, event));
    cdp.on('Network.loadingFinished', event => finished.push(event.requestId));
    cdp.on('Network.loadingFailed', event => failed.push(event.requestId));
    await cdp.send('Network.enable');
    await page.goto(origin + '/a');
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.src = '/dynamic.js';
      document.head.appendChild(script);
      void fetch('/pending').catch(() => {});
    });
    await waitForObservation(() => responses.has('/dynamic.js') && responses.has('/pending'), 'Máy chủ đã nhận đủ hai request');
    await waitForObservation(() => requests.has(origin + '/dynamic.js') && requests.has(origin + '/pending'), 'Script và fetch phát start trước response');
    const script = requests.get(origin + '/dynamic.js');
    assert.equal(script.type, 'Script');
    responses.get('/dynamic.js').writeHead(200, {'Content-Type':'application/javascript'}).end('document.title = "Ready";');
    await waitForObservation(() => finished.includes(script.requestId), 'Script kết thúc với request ID ban đầu');
    const outgoing = requests.get(origin + '/pending');
    await page.goto(origin + '/b');
    await waitForObservation(() => failed.includes(outgoing.requestId), 'Tài liệu cũ trả terminal sau khi bị thay');
    assert.equal(finished.includes(outgoing.requestId), false);
    assert.equal(failed.filter(id => id === outgoing.requestId).length, 1);
    await cdp.detach();
  } finally { await page.close(); }
}

test('Obscura báo script động từ lúc gửi và nhả fetch của tài liệu cũ khi điều hướng',
  {skip: !available, timeout: 30000}, verifyDocumentRequestOwnership);
