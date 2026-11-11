import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { openPageDevtools } from '../src/browser/screen/open-page-devtools.mjs';
import { screenRouteHandlers } from '../src/http/routes/screen-handlers.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { screencastSessions } from '../src/runtime/constants/screencast-sessions.mjs';

// Fixture không truy cập website, proxy hoặc profile thật.
test('DevTools dùng CDP cấp browser của đúng target và chỉ detach client tạm', async () => {
  const calls = [];
  const targetClient = { send: async command => { calls.push(command); return { targetInfo: { targetId: 'selected-tab' } }; }, detach: async () => calls.push('detach-page') };
  const rootClient = { send: async (command, args) => { calls.push({ command, args }); }, detach: async () => calls.push('detach-browser') };
  const page = { context: () => ({ newCDPSession: async () => targetClient, browser: () => ({ newBrowserCDPSession: async () => rootClient }) }) };
  assert.equal(await openPageDevtools(page), true);
  assert.deepEqual(calls[1], { command: 'Target.openDevTools', args: { targetId: 'selected-tab', panelId: 'elements' } });
  assert.ok(calls.includes('detach-page') && calls.includes('detach-browser'));
  rootClient.send = async () => { throw new Error('unsupported'); };
  assert.equal(await openPageDevtools(page), false);
  assert.equal(calls.filter(item => item === 'detach-browser').length, 2);
});

test('F12, iframe, copy và tải HTML dùng đúng tab Screen View; HTML không chạy script trong app', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const offers = await browser.newContext();
  await offers.route('**/*', route => route.fulfill({ contentType: 'text/html', body: `<form id="${route.request().url().endsWith('/selected') ? 'selected-form' : 'original-form'}"><input name="firstname"></form><iframe srcdoc='<form id="iframe-form"><input name="answer"></form>'></iframe><script>window.debugPayloadExecuted=1</script>` }));
  const main = await offers.newPage(); await main.goto('https://debug-offer.test/main');
  const selected = await offers.newPage(); await selected.goto('https://debug-offer.test/selected');
  const session = { slot: 4, browser: offers, mainPage: main };
  activeBrowsers.add(session);
  screencastSessions.set(4, { page: selected });
  t.after(() => { activeBrowsers.delete(session); screencastSessions.delete(4); });
  let debugRequests = 0;
  const server = createServer(async (request, response) => {
    if (request.url.startsWith('/screen/')) {
      if (request.url.startsWith('/screen/devtools/')) debugRequests++;
      for (const handler of screenRouteHandlers) if (await handler(request, response)) return;
      response.writeHead(404); response.end(); return;
    }
    const html = await readFile(new URL('../ui/desktop/index.html', import.meta.url), 'utf8');
    response.setHeader('content-type', 'text/html');
    response.end(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, ''));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const ui = await browser.newPage({ acceptDownloads: true });
  await ui.goto(base);
  await ui.addScriptTag({ content: "let _screenActiveSlot=4; function showToast(){} function copyToClipboard(text){window.copiedHtml=text;}" });
  for (const path of ['functions/_open-screen-devtools.js', 'functions/_open-screen-html.js', 'functions/_download-screen-html.js', 'setup/screen-debug-shortcuts.js']) {
    await ui.addScriptTag({ content: await readFile(new URL(`../ui/desktop/${path}`, import.meta.url), 'utf8') });
  }
  await ui.evaluate(() => { document.getElementById('screenModal').style.display = 'flex'; });
  await ui.keyboard.press('F12');
  await ui.waitForFunction(() => document.getElementById('screenHtmlPanel').dataset.ready === 'true' && !_openScreenDevtools.pending);
  assert.equal(debugRequests, 1);
  assert.match(await ui.locator('#screenHtmlContent').inputValue(), /id="selected-form"/);
  assert.equal(await ui.evaluate(() => window.debugPayloadExecuted), undefined);
  await ui.locator('#screenHtmlCopy').click();
  assert.match(await ui.evaluate(() => window.copiedHtml), /id="selected-form"/);
  await ui.selectOption('#screenHtmlFrame', '1');
  await ui.waitForFunction(() => document.getElementById('screenHtmlPanel').dataset.ready === 'true' && document.getElementById('screenHtmlPanel').dataset.frame === '1');
  assert.match(await ui.locator('#screenHtmlContent').inputValue(), /<form id="iframe-form">/);
  const pendingDownload = ui.waitForEvent('download');
  await ui.locator('#screenHtmlDownload').click();
  const download = await pendingDownload;
  assert.equal(download.suggestedFilename(), 'autoleadpc-slot-4-frame-1.html');
  assert.match(await readFile(await download.path(), 'utf8'), /<form id="iframe-form">/);
  await ui.evaluate(() => { window.webkit = { messageHandlers: { autoleadDebugHtml: { postMessage: value => { window.nativeHtmlSave = value; } } } }; });
  await ui.locator('#screenHtmlDownload').click();
  assert.equal(await ui.evaluate(() => window.nativeHtmlSave.filename), 'autoleadpc-slot-4-frame-1.html');
  assert.match(await ui.evaluate(() => window.nativeHtmlSave.html), /<form id="iframe-form">/);
  await ui.keyboard.press('Escape');
  assert.equal(await ui.locator('#screenHtmlPanel').isVisible(), false);
  assert.equal(await ui.locator('#screenModal').isVisible(), true);
  assert.equal((await fetch(`${base}/screen/html/4?frame=-1`)).status, 400);
  assert.equal((await fetch(`${base}/screen/html/4?frame=99`)).status, 400);
  activeBrowsers.delete(session);
  assert.equal((await fetch(`${base}/screen/html/4`)).status, 404);
  assert.equal((await fetch(`${base}/screen/devtools/4`, { method: 'POST' })).status, 404);
  assert.equal(selected.isClosed(), false);
  assert.equal(main.isClosed(), false);
});


test('toolbar preview giữ đủ nút trong viewport nhỏ', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const { readUiAsset } = await import('../src/http/read-ui-asset.mjs');
  const html = (await readFile(new URL('../ui/desktop/index.html', import.meta.url), 'utf8')).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
  const styles = await readUiAsset('desktop/styles.css');
  for (const width of [900, 640, 480, 360, 320]) {
    const page = await browser.newPage({ viewport: { width, height: 700 } });
    await page.setContent(html);
    await page.addStyleTag({ content: styles });
    const layout = await page.evaluate(() => {
      const modal = document.getElementById('screenModal');
      modal.style.display = 'flex';
      const header = modal.querySelector('.screen-preview-header');
      const buttons = [...header.querySelectorAll('button')].map(button => {
        const rect = button.getBoundingClientRect();
        return { text: button.textContent.trim(), left: rect.left, right: rect.right };
      });
      return {
        documentWidth: document.documentElement.scrollWidth,
        headerWidth: header.clientWidth,
        headerScrollWidth: header.scrollWidth,
        visibleButtons: buttons.filter(button => button.left >= 0 && button.right <= innerWidth).length,
        buttonCount: buttons.length,
      };
    });
    assert.equal(layout.documentWidth, width, `Trang không được tràn ngang ở ${width}px`);
    assert.equal(layout.headerScrollWidth, layout.headerWidth, `Toolbar không được cắt nút ở ${width}px`);
    assert.equal(layout.visibleButtons, layout.buttonCount, `Mọi nút phải nằm trong viewport ở ${width}px`);
    assert.equal(layout.buttonCount, 9);
    await page.close();
  }
});
