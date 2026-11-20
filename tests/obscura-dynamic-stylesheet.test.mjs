import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { openObscuraBrowser } from '../src/obscura-engine/open-obscura-browser.mjs';

/**
 * Kiểm tra khả năng nạp stylesheet động qua thuộc tính JS và element link.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
test('Obscura tải đầy đủ stylesheet khi thẻ link được tạo và gán href bằng JavaScript', async () => {
  const fetchedPaths = [];
  const server = http.createServer((req, res) => {
    fetchedPaths.push(req.url);
    if (req.url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!DOCTYPE html>
<html>
<head>
  <title>Dynamic CSS Test</title>
</head>
<body>
  <div id="target1" class="box1">Box 1</div>
  <div id="target2" class="box2">Box 2</div>
  <script>
    // Cách 1: Gán link.href và link.rel TRƯỚC khi appendChild (giống thư viện Twyne của FinancialHelpFinder)
    var link1 = document.createElement('link');
    link1.rel = 'stylesheet';
    link1.href = '/dyn-style1.css';
    document.head.appendChild(link1);

    // Cách 2: appendChild TRƯỚC rồi mới gán link.href và link.rel
    var link2 = document.createElement('link');
    document.head.appendChild(link2);
    link2.rel = 'stylesheet';
    link2.href = '/dyn-style2.css';
  </script>
</body>
</html>`);
      return;
    }
    if (req.url === '/dyn-style1.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end('.box1 { color: red; display: flex; }');
      return;
    }
    if (req.url === '/dyn-style2.css') {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end('.box2 { color: blue; font-size: 24px; }');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/`;

  const session = await openObscuraBrowser({
    slot: 999,
    port: 0,
    seed: 12345,
    os: 'mac-arm',
    targetUrl: baseUrl,
  });

  try {
    const page = session.page;

    // Chờ 1s để dynamic script chạy và nạp CSS
    await new Promise((r) => setTimeout(r, 1000));

    const val = await page.evaluate(() => {
      const links = document.querySelectorAll('link');
      return {
        linksCount: links.length,
        isLinkInstance1: links[0] instanceof HTMLLinkElement,
        isLinkInstance2: links[1] instanceof HTMLLinkElement,
        href1: links[0] ? links[0].href : '',
        href2: links[1] ? links[1].href : '',
        rel1: links[0] ? links[0].rel : '',
        rel2: links[1] ? links[1].rel : '',
      };
    });

    assert.equal(val.linksCount, 2, 'Phải có 2 thẻ link trong DOM');
    assert.equal(val.isLinkInstance1, true, 'Thẻ link 1 phải là instance của HTMLLinkElement');
    assert.equal(val.isLinkInstance2, true, 'Thẻ link 2 phải là instance của HTMLLinkElement');
    assert.equal(val.rel1, 'stylesheet');
    assert.equal(val.rel2, 'stylesheet');
    assert.ok(val.href1.includes('/dyn-style1.css'), 'link 1 phải giữ đúng href');
    assert.ok(val.href2.includes('/dyn-style2.css'), 'link 2 phải giữ đúng href');

    // Kiểm tra server đã nhận được request nạp cả 2 file CSS
    assert.ok(fetchedPaths.includes('/dyn-style1.css'), 'Server phải nhận được request tải dyn-style1.css');
    assert.ok(fetchedPaths.includes('/dyn-style2.css'), 'Server phải nhận được request tải dyn-style2.css');
  } finally {
    await session.close().catch(() => {});
    await new Promise((resolve) => server.close(resolve));
  }
});

for (const engine of ['Chromium', 'Obscura']) {
  test(engine + ' giữ CSS cha và import hợp lệ sau redirect khi import khác trả 404', { timeout: 20000 }, async t => {
    const requests = [];
    const server = http.createServer((req, res) => {
      const path = new URL(req.url, 'http://localhost').pathname;
      requests.push(path);
      if (path === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!doctype html><div id="parent">parent</div><div id="child">child</div>');
      } else if (path === '/start.css') {
        res.writeHead(302, { Location: '/theme/root.css' }).end();
      } else if (path === '/theme/root.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' });
        res.end('@import "child.css"; @import "missing.css"; #parent { width: 123px }');
      } else if (path === '/theme/child.css') {
        res.writeHead(200, { 'Content-Type': 'text/css' }).end('#child { width: 64px }');
      } else {
        res.writeHead(404, { 'Content-Type': 'text/html' }).end('missing');
      }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => {
      server.closeAllConnections();
      return new Promise(resolve => server.close(resolve));
    });
    let page;
    if (engine === 'Obscura') {
      const { resolveObscuraBinary } = await import('../src/obscura-engine/resolve-obscura-binary.mjs');
      try { resolveObscuraBinary(); } catch { return t.skip('Chưa có binary Obscura'); }
      const session = await openObscuraBrowser({ slot: 997, port: 0, os: 'ipad', registerSession: false });
      t.after(() => session.close());
      page = session.page;
    } else {
      const { chromium } = await import('playwright');
      const { existsSync } = await import('node:fs');
      if (!existsSync(chromium.executablePath())) return t.skip('Chưa cài Chromium');
      const browser = await chromium.launch();
      t.after(() => browser.close());
      page = await browser.newPage();
    }
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.evaluate(() => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/start.css?token=fixture-private';
      link.onload = () => { document.title = 'load'; };
      link.onerror = () => { document.title = 'error'; };
      document.head.appendChild(link);
    });
    await page.waitForFunction(() => document.title === 'load' || document.title === 'error');
    assert.equal(await page.title(), 'error', 'Lỗi import vẫn được báo trên link');
    assert.deepEqual(await page.evaluate(() => ['parent', 'child'].map(id => getComputedStyle(document.getElementById(id)).width)), ['123px', '64px'], requests.join(', '));
    assert.ok(requests.includes('/theme/missing.css'));
  });
}

test('debug CSS ghi đúng lỗi, giới hạn tài nguyên và trạng thái DOM theo tab', { timeout: 20000 }, async t => {
  const { resolveObscuraBinary } = await import('../src/obscura-engine/resolve-obscura-binary.mjs');
  try { resolveObscuraBinary(); } catch { return t.skip('Chưa có binary Obscura'); }
  const previous = process.env.AUTOLEADPC_CSS_DEBUG;
  process.env.AUTOLEADPC_CSS_DEBUG = '1';
  t.after(() => {
    if (previous === undefined) delete process.env.AUTOLEADPC_CSS_DEBUG;
    else process.env.AUTOLEADPC_CSS_DEBUG = previous;
  });
  const logs = [];
  let onSnapshot;
  const snapshot = new Promise(resolve => { onSnapshot = resolve; });
  t.mock.method(console, 'info', value => {
    if (!String(value).includes('[CSS]')) return;
    logs.push(value);
    if (value.includes('event=dom_snapshot')) onSnapshot();
  });
  const fetched = new Set();
  const server = http.createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    fetched.add(path);
    if (path === '/limits') {
      const links = Array.from({length: 129}, (_, index) => '<link rel="stylesheet" href="/file-' + index + '.css">');
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html>' + links.join(''));
    } else if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<!doctype html><link rel="stylesheet" href="/ok.css"><link rel="stylesheet" href="/private-fixture-path?token=fixture-private"><link rel="stylesheet" href="/missing.css"><p>test</p>');
    } else if (path === '/private-fixture-path') {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end('<p>fixture</p>');
    } else if (path === '/missing.css') {
      res.writeHead(404, { 'Content-Type': 'text/html' }).end('missing');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/css' }).end('p{width:70px}');
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise(resolve => server.close(resolve));
  });
  const session = await openObscuraBrowser({ slot: 997, port: 0, os: 'ipad', registerSession: false });
  t.after(() => session.close());
  const origin = 'http://127.0.0.1:' + server.address().port;
  await session.page.goto(origin);
  await snapshot;
  assert.ok(logs.some(line => /event=dom_snapshot frame=main sheet_present=[1-9]/.test(line)));
  assert.ok(logs.some(line => line.includes('slot=997 tab=1') && line.includes('status=200 mime=html result=unexpected_mime')));
  assert.ok(logs.some(line => line.includes('status=404 mime=html result=http_error')));
  assert.ok(logs.some(line => line.includes('status=200 mime=css result=ok')));
  const cssTab = await session.browser.newPage();
  const failures = [];
  cssTab.on('requestfailed', req => { if (req.resourceType() === 'stylesheet') failures.push(req.failure()?.errorText); });
  await cssTab.goto(origin + '/limits');
  assert.ok(logs.some(line => line.includes('slot=997 tab=2') && line.includes('reason=resource_limit')));
  assert.ok(fetched.has('/file-127.css'));
  assert.equal(fetched.has('/file-128.css'), false);
  assert.deepEqual(failures, ['Stylesheet resource limit reached']);
  assert.equal(logs.some(line => /fixture-private|private-fixture-path|127\.0\.0\.1/.test(line)), false);
});


test('debug CSS tắt mặc định không gắn listener hoặc đọc DOM', async t => {
  const { attachStylesheetDiagnostics } = await import('../src/obscura-engine/attach-stylesheet-diagnostics.mjs');
  const previous = process.env.AUTOLEADPC_CSS_DEBUG;
  delete process.env.AUTOLEADPC_CSS_DEBUG;
  t.after(() => { if (previous !== undefined) process.env.AUTOLEADPC_CSS_DEBUG = previous; });
  attachStylesheetDiagnostics({ on: assert.fail, pages: assert.fail }, 1);
});
