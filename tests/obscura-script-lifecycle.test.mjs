import './helpers/obscura-data-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import http from 'node:http';
import { chromium } from 'playwright';
import { openObscuraBrowser } from '../src/obscura-engine/open-obscura-browser.mjs';

/**
 * Dựng fixture script offline để đối chiếu lifecycle với Chromium.
 * @return {Promise<http.Server>} Server loopback, không gửi dữ liệu ra ngoài.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function createScriptServer() {
  const server = http.createServer((request, response) => {
    const path = new URL(request.url, 'http://fixture.test').pathname;
    if (path.endsWith('.js')) {
      response.setHeader('Content-Type', 'application/javascript');
      const scripts = {
        '/slow.js': [180, "order.push('slow');"],
        '/fast.js': [20, "order.push('fast');const input=document.createElement('input');input.type='email';document.body.appendChild(input);"],
        '/defer.js': [5, "order.push('defer:'+document.readyState);"],
        '/throw.js': [0, "throw new Error('fixture error');"],
        '/async-import.js': [20, "import('too-late').then(module=>window.importValue=module.value).catch(()=>window.importValue='rejected');"],
        '/later-module.js': [0, "export const value='later-map';"],
      };
      if (!scripts[path]) { response.writeHead(404); response.end('window.badExecuted=true;'); return; }
      const [delay, source] = scripts[path];
      setTimeout(() => response.end(source), delay);
      return;
    }
    const fixtures = {
      '/async': `<script async src="/slow.js" onload="order.push('slow-load')"></script>
        <script async src="/fast.js" onload="order.push('fast-load')"></script><script>order.push('inline')</script>`,
      '/defer': `<script defer src="/defer.js" onload="order.push('defer-load')"></script>
        <script src="/slow.js" onload="order.push('classic-load')"></script><script>order.push('inline')</script>`,
      '/error': `<script src="/missing.js" onerror="order.push('missing-error')" onload="order.push('wrong-load')"></script>
        <script src="/throw.js" onload="order.push('throw-load')"></script><script>order.push('after')</script>`,
      '/import-map': `<script async src="/async-import.js"></script>
        <script type="importmap">{"imports":{"too-late":"/later-module.js"}}</script>`,
    };
    response.setHeader('Content-Type', 'text/html');
    response.end(`<!doctype html><html><head><script>
      window.order=[];window.lifecycle=[];
      document.addEventListener('DOMContentLoaded',event=>{order.push('dcl');lifecycle.push(['document',event.target===document,event.bubbles]);});
      window.addEventListener('DOMContentLoaded',event=>lifecycle.push(['window',event.target===document,event.bubbles]));
      window.addEventListener('load',()=>order.push('load'));
    </script>${fixtures[path] || ''}</head><body></body></html>`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return server;
}

/**
 * Đối chiếu thứ tự script, sự kiện và kết quả form qua hai engine thật.
 * @param {import('node:test').TestContext} t Quản lý tài nguyên thử nghiệm.
 * @return {Promise<void>} Hoàn tất so sánh offline.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
test('Obscura khớp Chromium về classic/defer/async, callback lỗi và DOMContentLoaded', { skip: !existsSync(chromium.executablePath()), timeout: 45000 }, async t => {
  const server = await createScriptServer();
  const chrome = await chromium.launch({ headless: true });
  let obscura;
  t.after(async () => {
    await obscura?.close();
    await chrome.close();
    await new Promise(resolve => server.close(resolve));
  });
  obscura = await openObscuraBrowser({ slot: 983, port: 0, registerSession: false });
  const chromePage = await chrome.newPage();
  for (const path of ['/async', '/defer', '/error', '/import-map']) {
    const results = [];
    for (const page of [chromePage, obscura.page]) {
      await page.goto(`http://127.0.0.1:${server.address().port}${path}`);
      if (path === '/import-map') await page.waitForFunction(() => window.importValue !== undefined, null, { timeout: 3000 });
      results.push(await page.evaluate(() => ({
        order: window.order,
        lifecycle: window.lifecycle,
        inputs: document.querySelectorAll('input').length,
        badExecuted: window.badExecuted === true,
        currentScriptCleared: document.currentScript === null,
        importValue: window.importValue ?? null,
      })));
    }
    assert.deepEqual(results[1], results[0], `Khác Chromium tại fixture ${path}`);
  }
});
