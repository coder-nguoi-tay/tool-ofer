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
