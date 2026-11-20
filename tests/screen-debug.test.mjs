import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { findSelectAtPoint } from '../src/browser/screen/find-select-at-point.mjs';
import { openPageDevtools } from '../src/browser/screen/open-page-devtools.mjs';
import { screenRouteHandlers } from '../src/http/routes/screen-handlers.mjs';
import { handlePostScreenInput } from '../src/http/routes/screen/post-input.mjs';
import { activeBrowsers } from '../src/browser/sessions.mjs';
import { screencastSessions } from '../src/runtime/constants/screencast-sessions.mjs';

test('Screen View mở đúng select trong Shadow DOM và iframe lồng, giữ trạng thái khóa của HTML', { skip: !existsSync(chromium.executablePath()) }, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route('https://select.fixture.test/**', route => {
    const depth = Number(new URL(route.request().url()).pathname.slice(1));
    const body = depth < 3
      ? `<iframe style="width:500px;height:260px;border:3px solid" src="/${depth + 1}"></iframe>`
      : '<div id="host"></div>';
    return route.fulfill({ contentType: 'text/html', body });
  });
  await page.goto('https://select.fixture.test/0');
  const innerFrame = page.frames().find(frame => frame.url().endsWith('/3'));
  await innerFrame.evaluate(() => {
    const root = document.querySelector('#host').attachShadow({ mode: 'open' });
    root.innerHTML = '<div id="inner"></div>';
    root.querySelector('#inner').attachShadow({ mode: 'open' }).innerHTML = `
      <select id="drop"><option>A</option><option selected>B</option><optgroup disabled label="Khóa"><option>C</option></optgroup></select>
      <fieldset disabled><select id="locked"><option>Khóa</option></select></fieldset>
      <select id="list" size="2"><option>Danh sách</option></select>
      <select id="multi" multiple><option>Nhiều mục</option></select>
    `;
  });
  for (const id of ['drop', 'locked', 'list', 'multi']) {
    const box = await innerFrame.locator('#' + id).boundingBox();
    const pick = await findSelectAtPoint(page, box.x + box.width / 2, box.y + box.height / 2);
    if (id === 'drop') {
      assert.ok(pick, 'Điểm bấm phải mở đúng ô chọn');
      assert.ok(pick.frame === innerFrame, 'Phải trả về frame sở hữu ô đã bấm');
      assert.equal(pick.selectedIndex, 1);
      assert.deepEqual(pick.options, [
        { label: 'A', disabled: false }, { label: 'B', disabled: false }, { label: 'C', disabled: true }
      ]);
      assert.equal(await innerFrame.locator('#drop').getAttribute('data-ux-screen-select'), pick.uid);
      const reopened = await findSelectAtPoint(page, box.x + box.width / 2, box.y + box.height / 2);
      assert.notEqual(reopened.uid, pick.uid);
    } else {
      assert.ok(pick === null, id);
    }
  }
});

test('Screen View giữ mouseup cho control thường khi không nhận diện được select theo điểm bấm', {
  skip: !existsSync(chromium.executablePath())
}, async t => {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await page.setContent('<button id="button">Bấm</button><select id="select"><option>A</option><option>B</option></select>');
  await page.locator('#button').evaluate(button => {
    button.addEventListener('click', () => { button.dataset.clicked = 'true'; });
  });
  const cdpClient = await page.context().newCDPSession(page);
  const slot = 97;
  // Mô phỏng metadata còn sót của tab trước. Handler phải lấy viewport sống của page.
  screencastSessions.set(slot, { page, cdpClient, deviceWidth: 400, deviceHeight: 300 });
  t.after(async () => {
    screencastSessions.delete(slot);
    await cdpClient.detach().catch(() => {});
  });

  const server = createServer((request, response) => {
    void handlePostScreenInput(request, response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/screen/input/' + slot;
  const send = body => fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(response => response.json());

  const selectRect = await page.locator('#select').boundingBox();
  const selectPoint = {
    x: Math.round((selectRect.x + selectRect.width / 2) / 2),
    y: Math.round((selectRect.y + selectRect.height / 2) / 2),
    clientWidth: 400,
    clientHeight: 300
  };
  const openedSelect = await send({ type: 'mousedown', ...selectPoint, button: 'left' });
  assert.ok(openedSelect.select, 'Select phải được tìm thấy sau khi quy đổi viewport khác kích thước');
  assert.deepEqual(await send({
    type: 'select',
    uid: openedSelect.select.uid,
    index: 1
  }), { ok: true });
  assert.equal(await page.locator('#select').inputValue(), 'B');

  const buttonRect = await page.locator('#button').boundingBox();
  const point = {
    x: Math.round((buttonRect.x + buttonRect.width / 2) / 2),
    y: Math.round((buttonRect.y + buttonRect.height / 2) / 2),
    clientWidth: 400,
    clientHeight: 300
  };
  assert.deepEqual(await send({ type: 'mousedown', ...point, button: 'left' }), { ok: true });
  assert.deepEqual(await send({ type: 'mouseup', ...point, button: 'left' }), { ok: true });
  assert.equal(await page.locator('#button').getAttribute('data-clicked'), 'true');
});

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
  for (const width of [1101, 1024, 901, 900, 640, 480, 360, 320]) {
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
    assert.equal(layout.buttonCount, 10);
    await page.close();
  }
});
