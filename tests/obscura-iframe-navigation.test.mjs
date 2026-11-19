import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { chromium } from 'playwright';
import { findFreePort } from '../src/obscura-engine/find-free-port.mjs';
import { resolveObscuraBinary } from '../src/obscura-engine/resolve-obscura-binary.mjs';
import { startObscuraSession } from '../src/obscura-engine/start-obscura-session.mjs';
import { stopObscuraSession } from '../src/obscura-engine/stop-obscura-session.mjs';

let available = true;
try { resolveObscuraBinary(); } catch { available = false; }

/**
 * Xác minh việc hủy kết nối, nội dung HTTP lỗi và quyền đọc iframe trên máy chủ cục bộ.
 * @param {import('node:test').TestContext} t Ngữ cảnh chạy thử.
 * @return {Promise<void>}
 * @throws {Error} Khi browser hoặc máy chủ vi phạm hợp đồng điều hướng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function verifyIframeNavigation(t) {
  const requests = [];
  const server = createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/pending') return;
    if (req.url === '/drop') return req.socket.destroy();
    if (req.url === '/no-content') return res.writeHead(204).end();
    if (req.url === '/reset-content') return res.writeHead(205).end();
    if (req.url === '/plain-missing') {
      return res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('\n<p id="entry">Missing & local</p>');
    }
    if (req.url === '/redirect') {
      res.writeHead(302, { Location: '/missing' }).end();
      return;
    }
    const status = req.url === '/missing' || req.url === '/sandboxed' ? 404 : req.url === '/unavailable' ? 503 : 200;
    const head = req.url === '/sandboxed' ? '<head><script>document.title="script executed"</script></head>' : '';
    res.writeHead(status, { 'Content-Type': 'text/html' }).end('<!doctype html>' + head + '<p>HTTP ' + status + '</p>');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const origin = 'http://127.0.0.1:' + server.address().port;
  const engine = await startObscuraSession({ port: await findFreePort(0) });
  t.after(() => stopObscuraSession(engine.process));
  const browser = await chromium.connectOverCDP(engine.cdpEndpoint);
  const page = await browser.contexts()[0].newPage();
  page.setDefaultTimeout(5000);
  await page.goto(origin);

  await t.test('đổi src hủy kết nối cũ và hiển thị nội dung 404 sau redirect', async () => {
    const pending = once(server, 'request', { signal: AbortSignal.timeout(5000) });
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.id = 'child';
      frame.src = '/pending';
      document.body.appendChild(frame);
    });
    const [request, response] = await pending;
    assert.equal(request.url, '/pending');
    await Promise.all([
      once(response, 'close', { signal: AbortSignal.timeout(5000) }),
      page.evaluate(() => { document.getElementById('child').src = '/redirect'; }),
    ]);
    assert.equal(response.writableEnded, false);
    await page.waitForFunction(() => document.getElementById('child').contentDocument?.body?.textContent === 'HTTP 404');
    assert.equal(await page.evaluate(() => document.getElementById('child').contentDocument.URL), origin + '/missing');
  });

  await t.test('ghi cùng src tạo một lượt điều hướng mới, đọc body 503', async () => {
    await page.evaluate(() => { document.getElementById('child').src = '/unavailable'; });
    await page.waitForFunction(() => document.getElementById('child').contentDocument?.body?.textContent === 'HTTP 503');
    const next = once(server, 'request', { signal: AbortSignal.timeout(5000) });
    await page.evaluate(() => {
      const frame = document.getElementById('child');
      frame.setAttribute('src', frame.getAttribute('src'));
    });
    assert.equal((await next)[0].url, '/unavailable');
    assert.equal(requests.filter(path => path === '/unavailable').length, 2);
  });

  await t.test('sandbox vẫn cô lập tài liệu phản hồi 404 cùng origin', async () => {
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.id = 'opaque';
      frame.setAttribute('sandbox', '');
      frame.src = '/sandboxed';
      frame.onload = () => { document.body.dataset.opaqueLoaded = '1'; };
      document.body.appendChild(frame);
    });
    await page.waitForFunction(() => document.body.dataset.opaqueLoaded === '1');
    assert.equal(await page.evaluate(() => document.getElementById('opaque').contentDocument), null);
    const frame = page.frames().find(child => child.url() === origin + '/sandboxed');
    assert.ok(frame, 'HTTP 404 được ghi nhận là tài liệu của iframe');
    assert.equal(await frame.evaluate(() => document.title), '');
  });

  await t.test('HTTP 204 và 205 giữ nguyên tài liệu và dữ liệu của iframe, không phát load', async () => {
    const frame = await page.evaluateHandle(() => {
      const el = document.createElement('iframe');
      el.id = 'editable-document';
      el.src = '/old';
      document.body.appendChild(el);
      return el;
    });
    await page.waitForFunction(() => document.getElementById('editable-document').contentDocument?.URL.endsWith('/old'));
    try {
      await frame.evaluate(el => {
        const current = el.contentDocument;
        current.body.textContent = 'local edit';
        window.documentBeforeNoContent = current;
        el.dataset.loads = '0';
        el.onload = () => { el.dataset.loads = String(Number(el.dataset.loads) + 1); };
      });
      for (const [path, status] of [['/no-content', 204], ['/reset-content', 205]]) {
        const delivered = page.waitForResponse(response => response.url() === origin + path);
        await frame.evaluate((el, url) => { el.src = url; }, path);
        assert.equal((await delivered).status(), status);
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 80)));
        assert.deepEqual(await frame.evaluate(el => [el.contentDocument === window.documentBeforeNoContent,
          el.contentDocument?.body?.textContent, el.dataset.loads]), [true, 'local edit', '0']);
        assert.equal(page.frames().filter(child => child.url() === origin + '/old').length, 1);
      }
    } finally { await frame.dispose(); }
  });

  await t.test('lỗi transport giữ frame con với tài liệu lỗi riêng biệt', async () => {
    const failure = page.waitForEvent('requestfailed', req => req.url() === origin + '/drop');
    await page.evaluate(() => {
      const el = document.createElement('iframe');
      el.id = 'failed-document';
      el.onload = () => { el.dataset.loaded = 'yes'; };
      el.src = '/drop';
      document.body.appendChild(el);
    });
    await failure;
    await page.waitForFunction(() => document.getElementById('failed-document').dataset.loaded === 'yes');
    const failedFrame = await page.locator('#failed-document').elementHandle();
    try {
      const child = await failedFrame.contentFrame();
      assert.equal(child?.url(), 'chrome-error://chromewebdata/');
      assert.equal(child.parentFrame(), page.mainFrame());
      assert.equal(await failedFrame.evaluate(el => el.contentDocument), null);
    } finally { await failedFrame.dispose(); }
  });

  await t.test('tài liệu lỗi text/plain hiển thị nguyên văn giống Chromium', async () => {
    await page.evaluate(() => {
      const el = document.createElement('iframe');
      el.id = 'plain-document';
      el.src = '/plain-missing';
      document.body.appendChild(el);
    });
    await page.waitForFunction(() => document.getElementById('plain-document').contentDocument?.URL.endsWith('/plain-missing'));
    const plain = page.frames().find(child => child.url() === origin + '/plain-missing');
    assert.ok(plain);
    assert.deepEqual(await plain.evaluate(() => [document.contentType, document.body.textContent,
      document.querySelector('pre')?.textContent, !!document.getElementById('entry')]),
      ['text/plain', '\n<p id="entry">Missing & local</p>', '\n<p id="entry">Missing & local</p>', false]);
  });

  await t.test('xóa src giữ frame about:blank và phát đúng một load', async () => {
    await page.evaluate(() => {
      const el = document.getElementById('plain-document');
      el.dataset.loads = '0';
      el.onload = () => { el.dataset.loads = String(Number(el.dataset.loads) + 1); };
      el.removeAttribute('src');
      el.removeAttribute('src');
    });
    await page.waitForFunction(() => document.getElementById('plain-document').dataset.loads === '1');
    const owner = await page.locator('#plain-document').elementHandle();
    try {
      assert.equal(await owner.evaluate(el => el.contentDocument?.body?.textContent), '');
      assert.equal((await owner.contentFrame())?.url(), 'about:blank');
      assert.equal(await owner.evaluate(el => el.dataset.loads), '1');
    } finally { await owner.dispose(); }
  });

  await t.test('tháo iframe chưa nhận response giải phóng kết nối', async () => {
    const pending = once(server, 'request', { signal: AbortSignal.timeout(5000) });
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.id = 'detached';
      frame.src = '/pending';
      document.body.appendChild(frame);
    });
    const [request, response] = await pending;
    assert.equal(request.url, '/pending');
    await Promise.all([
      once(response, 'close', { signal: AbortSignal.timeout(5000) }),
      page.evaluate(() => document.getElementById('detached').remove()),
    ]);
    assert.equal(response.writableEnded, false);
  });
}
test('Obscura bảo toàn trạng thái điều hướng iframe', { skip: !available, timeout: 30000 }, verifyIframeNavigation);
