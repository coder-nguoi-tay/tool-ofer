import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { chromium } from 'playwright';

const readyProxy = '192.0.2.10:1080';
const usedProxy = '192.0.2.11:1080';
const newProxy = '192.0.2.12:1080';

test('nhập proxy tay giữ hàng đợi hiện có và dùng đúng nút trên giao diện', async t => {
  const dataDirectory = await mkdtemp(join(homedir(), 'Library/Application Support/AutoLeadPC-proxy-import-tests-'));
  const previousDataDirectory = process.env.AUTOLEADPC_DATA_DIR;
  process.env.AUTOLEADPC_DATA_DIR = basename(dataDirectory);
  t.after(async () => {
    if (previousDataDirectory === undefined) delete process.env.AUTOLEADPC_DATA_DIR;
    else process.env.AUTOLEADPC_DATA_DIR = previousDataDirectory;
    await rm(dataDirectory, { recursive: true, force: true });
  });
  const { handlePostProxyQueueImport } = await import('../src/http/routes/proxy/post-queue-import.mjs');
  const { proxyQueue } = await import('../src/runtime/constants/proxy-queue.mjs');
  let lastImport;
  const server = createServer(async (request, response) => {
    if (request.url === '/proxy-queue/import') {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString();
      lastImport = JSON.parse(body);
      const { Readable } = await import('node:stream');
      const importRequest = Readable.from([body]);
      importRequest.method = request.method;
      importRequest.url = request.url;
      await handlePostProxyQueueImport(importRequest, response);
      return;
    }
    if (request.url === '/proxy-queue') {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ available: proxyQueue.available.length, used: proxyQueue.used.length, availableList: proxyQueue.available }));
      return;
    }
    const html = await readFile(new URL('../ui/desktop/index.html', import.meta.url), 'utf8');
    response.setHeader('Content-Type', 'text/html');
    response.end(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, ''));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  await t.test('append giữ proxy sẵn sàng/đã dùng và bỏ dòng trùng hoặc sai', async () => {
    proxyQueue.available = [readyProxy];
    proxyQueue.used = [usedProxy];
    const response = await fetch(baseUrl + '/proxy-queue/import', {
      method: 'POST', body: JSON.stringify({ mode: 'append', proxyType: 'socks5', proxyList: [newProxy, newProxy, readyProxy, usedProxy, '# comment', 'not-a-proxy'].join('\r\n') }),
    });
    assert.equal((await response.json()).added, 1);
    assert.deepEqual(proxyQueue.available, [readyProxy, newProxy]);
    assert.deepEqual(proxyQueue.used, [usedProxy]);
  });
  await t.test('client cũ vẫn đồng bộ khi không truyền mode append', async () => {
    await fetch(baseUrl + '/proxy-queue/import', { method: 'POST', body: JSON.stringify({ proxyList: newProxy }) });
    assert.deepEqual(proxyQueue.available, [newProxy]);
    assert.deepEqual(proxyQueue.used, [usedProxy]);
  });
  await t.test('nút thật gửi giao thức, cập nhật số lượng và giữ nội dung khi lỗi', {
    skip: !await import('node:fs').then(({ existsSync }) => existsSync(chromium.executablePath())) && 'Chưa cài Chromium của Playwright',
  }, async () => {
    proxyQueue.available = [readyProxy];
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(baseUrl);
      await page.evaluate(() => {
        document.body.innerHTML = document.getElementById('infopanel-proxy').outerHTML + '<div id="lbStatus"></div>';
        window.alertMessages = [];
        window.showWinAlert = message => window.alertMessages.push(message);
      });
      for (const name of ['api', 'load-proxy-queue', 'import-manual-proxy-queue']) {
        await page.addScriptTag({ content: await readFile(new URL(`../ui/desktop/functions/${name}.js`, import.meta.url), 'utf8') });
      }
      const button = page.locator('#btnImportProxyQueue');
      const input = page.locator('#txtDashboardProxy');
      await page.selectOption('#dashboardProxyType', 'http');
      await input.fill(newProxy);
      await button.click();
      await page.waitForFunction(() => document.getElementById('lbProxyCount').textContent === '2');
      assert.equal(lastImport.mode, 'append');
      assert.equal(lastImport.proxyType, 'http');
      assert.deepEqual(proxyQueue.available, [readyProxy, newProxy]);
      assert.equal(await input.inputValue(), [readyProxy, newProxy].join('\n'));
      await input.fill('');
      await button.click();
      assert.match(await page.evaluate(() => window.alertMessages.at(-1)), /Vui lòng dán/);
      await page.route('**/proxy-queue/import', route => route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'fixture-import-failed' }) }));
      await input.fill('192.0.2.13:1080');
      await button.click();
      await page.waitForFunction(() => window.alertMessages.at(-1) === 'fixture-import-failed');
      assert.equal(await input.inputValue(), '192.0.2.13:1080');
      assert.equal(await button.isEnabled(), true);
    } finally {
      await browser.close();
    }
  });
});
