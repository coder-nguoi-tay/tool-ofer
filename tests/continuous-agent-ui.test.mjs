import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { serveUiAsset } from '../src/http/ui-assets.mjs';

test('form Agent API trên giao diện desktop: nạp, lưu (key không hiển thị lại) và thử kết nối', async t => {
  const saved = [];
  let stored = { transport: 'agy', apiFormat: 'openai', apiBaseUrl: '', apiModel: '', apiKeySet: false, apiKeyHint: '' };
  const page_html = (await readFile(new URL('../ui/desktop/index.html', import.meta.url), 'utf8')).replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '').replace(/<link[^>]*>/g, '');
  const server = createServer(async (request, response) => {
    if (request.url === '/__ui') { response.setHeader('content-type', 'text/html'); return response.end(page_html); }
    if (await serveUiAsset(request, response)) return;
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => {
      response.setHeader('content-type', 'application/json');
      if (request.url === '/agent/api/config' && request.method === 'GET') return response.end(JSON.stringify(stored));
      if (request.url === '/agent/api/config') {
        const patch = JSON.parse(body); saved.push(patch);
        stored = { ...stored, ...patch, apiKey: undefined, apiKeySet: Boolean(patch.apiKey) || stored.apiKeySet, apiKeyHint: patch.apiKey ? `…${patch.apiKey.slice(-4)}` : stored.apiKeyHint };
        return response.end(JSON.stringify({ success: true, config: stored }));
      }
      if (request.url === '/agent/api/test') return response.end(JSON.stringify({ ok: true, ms: 12, reply: 'OK' }));
      response.end('{}');
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/__ui`);
  await page.addScriptTag({ url: `${base}/assets/desktop/app.js?v=1` });
  await page.evaluate(() => loadAgentApiConfigUi());
  assert.equal(await page.inputValue('#cbbAgentTransport'), 'agy');
  assert.equal(await page.getAttribute('#txtAgentApiUrl', 'placeholder'), 'https://api.openai.com/v1');

  await page.selectOption('#cbbAgentTransport', 'api');
  await page.selectOption('#cbbAgentApiFormat', 'anthropic');
  assert.equal(await page.getAttribute('#txtAgentApiUrl', 'placeholder'), 'https://api.anthropic.com');
  await page.fill('#txtAgentApiUrl', 'https://api.anthropic.com');
  await page.fill('#txtAgentApiModel', 'm-1');
  await page.fill('#txtAgentApiKey', 'sk-ant-abcd1234');
  await page.evaluate(() => saveAgentApiConfigUi());
  assert.deepEqual(saved[0], { transport: 'api', apiFormat: 'anthropic', apiBaseUrl: 'https://api.anthropic.com', apiModel: 'm-1', apiKey: 'sk-ant-abcd1234' });
  assert.equal(await page.inputValue('#txtAgentApiKey'), '', 'key bị xóa khỏi form sau khi lưu');
  assert.ok((await page.getAttribute('#txtAgentApiKey', 'placeholder')).includes('1234'));
  assert.ok(!(await page.content()).includes('sk-ant-abcd1234'), 'key không còn trong DOM');
  assert.equal(await page.textContent('#agentApiStatus'), 'Đã lưu cấu hình Agent.');

  await page.evaluate(() => testAgentApiConfigUi());
  assert.equal(saved.at(-1).apiKey, '', 'lần lưu sau gửi key rỗng → server giữ key cũ');
  assert.match(await page.textContent('#agentApiStatus'), /Kết nối OK \(12ms\)/);
  assert.deepEqual(errors, []);
});
