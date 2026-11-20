import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getTunnelUrl, startTunnel, stopTunnel } from "../tunnel.mjs";
import { BOT_COMMANDS } from "../tgbot.mjs";

const __filename = fileURLToPath(import.meta.url);
const projectDirectory = dirname(dirname(__filename));

test('Telegram Mini App & Remote Control Test Suite', async (t) => {
  await t.test('Mini App HTML nằm trong thư mục riêng và chứa đủ thành phần', () => {
    const htmlPath = join(projectDirectory, 'ui/mini/index.html');
    assert.equal(existsSync(htmlPath), true, 'ui/mini/index.html phải tồn tại');
    const uiDirectory = join(projectDirectory, 'ui/mini');
    const uiSources = readdirSync(uiDirectory, { recursive: true }).filter((name) => /\.(js|css)$/.test(name));
    const content = readFileSync(htmlPath, 'utf8') + uiSources.map((name) => readFileSync(join(uiDirectory, name), 'utf8')).join('\n');

    // 1. Telegram WebApp SDK
    assert.match(content, /telegram-web-app\.js/, 'Phải nạp Telegram WebApp SDK');
    assert.match(content, /Telegram(\.|\?\.)WebApp/, 'Phải gọi Telegram.WebApp API');

    // 2. Canvas & Stream
    assert.match(content, /id="streamCanvas"/, 'Phải có canvas vẽ stream');
    assert.match(content, /\/screen\/stream\//, 'Phải kết nối SSE /screen/stream/:slot');

    // 3. Touch to Click & Drag to Scroll
    assert.match(content, /touchstart/, 'Phải bắt touchstart');
    assert.match(content, /touchend/, 'Phải bắt touchend');
    assert.match(content, /mousedown/, 'Phải gửi mousedown để click');
    assert.match(content, /mouseup/, 'Phải gửi mouseup để click');
    assert.match(content, /wheel/, 'Phải gửi wheel để cuộn trang');

    // 4. Typing & Virtual Input
    assert.match(content, /id="textInput"/, 'Phải có ô nhập văn bản');
    assert.match(content, /btnSendText/, 'Phải có nút gửi chữ');
    assert.match(content, /data-key="Enter"/, 'Phải có phím Enter nhanh');
    assert.match(content, /data-key="Tab"/, 'Phải có phím Tab nhanh');

    // 5. Slot Selector
    assert.match(content, /id="slotBar"/, 'Phải có thanh chọn slot');

    // 6. Execution Options & Mode Checkboxes
    assert.match(content, /id="cbxRunInApp"/, 'Phải có checkbox Chạy trong app');
    assert.match(content, /id="cbxMultiTab"/, 'Phải có checkbox Đa luồng đa tab');
    assert.doesNotMatch(content, /cbxCloakBrowser/, 'Đã bỏ CloakBrowser');
    assert.match(content, /id="cbxDataSaver"/, 'Phải có checkbox Tiết kiệm data');
    assert.match(content, /id="cbxCheckDuplicateIP"/, 'Phải có checkbox Check duplicate IP');
    assert.match(content, /id="cbxHideUntilTarget"/, 'Phải có checkbox Ẩn đến trang đích');
    assert.match(content, /id="cbxHideUntilLead"/, 'Phải có checkbox Chỉ hiện khi có Lead');
    assert.match(content, /id="cbxCheckLead"/, 'Phải có checkbox Check Lead (20s)');
    assert.match(content, /id="cbxAiAssist"/, 'Phải có checkbox AI Assist');
    assert.doesNotMatch(content, /id="cbxRRS"/, 'Đã gỡ Save RRS (server không dùng)');
    assert.doesNotMatch(content, /id="chkAutoRefill"/, 'Đã gỡ Tự bù luồng (không có tác dụng)');
    assert.match(content, /id="cbxNoSlotRefill"/, 'Phải có Không bù slot');
    assert.match(content, /id="cbxAutoSubmit"/, 'Phải có checkbox Tự submit form');

    // 7. Platform Checkboxes
    assert.match(content, /id="chkWindows"/, 'Phải có platform Windows');
    assert.match(content, /id="chkMac"/, 'Phải có platform Mac');
    assert.match(content, /id="chkLinux"/, 'Phải có platform Linux');
    assert.match(content, /id="chkAndroid"/, 'Phải có platform Android');
    assert.match(content, /id="chkIphone"/, 'Phải có platform iPhone');
    assert.match(content, /id="chkIpad"/, 'Phải có platform iPad');

    // 8. Advanced Parity Features
    assert.doesNotMatch(content, /id="pillBrowserAdsPower"/, 'Đã gỡ AdsPower (server luôn chạy Chrome)');
    assert.match(content, /id="pillBrowserGoLogin"/, 'Phải có chọn GoLogin');
    assert.match(content, /id="pillBrowserChrome"/, 'Phải có chọn Chrome');
    assert.match(content, /id="inputWebsiteUrl2"/, 'Phải có Link Offer 2');
    assert.match(content, /id="btnSaveOffer"/, 'Phải có nút Lưu Offer');
    assert.match(content, /id="btnDeleteOffer"/, 'Phải có nút Xoá Offer');
    assert.match(content, /id="browserTabsBar"/, 'Phải có thanh Tab trình duyệt cho slot');
    assert.match(content, /id="selectModal"/, 'Phải có Select Modal bottom sheet');
    assert.match(content, /id="badgeAutofillCount"/, 'Phải có hàng đợi hồ sơ Autofill');
    assert.match(content, /id="btnHideAllBrowsers"/, 'Phải có điều khiển ẩn ngầm trình duyệt');
    assert.match(content, /id="btnShowAllBrowsers"/, 'Phải có điều khiển hiện cửa sổ');

    // 9. Start Button Dimmed & Disabled When Running
    assert.match(content, /\.btn:disabled/, 'Phải có CSS làm mờ nút khi disabled');
    assert.match(content, /btnStartLaunch/, 'Phải có ID nút btnStartLaunch');
    assert.match(content, /btnStart\.disabled = true/, 'Phải vô hiệu hoá nút Start khi đang chạy');
  });

  await t.test('tunnel.mjs functions are exported and behave properly', () => {
    assert.equal(typeof startTunnel, 'function');
    assert.equal(typeof stopTunnel, 'function');
    assert.equal(typeof getTunnelUrl, 'function');
    const url = getTunnelUrl();
    assert.ok(url === null || url.startsWith('https://'), 'URL tunnel phải là null hoặc chuỗi https://');
  });

  await t.test('tgbot.mjs includes app command in BOT_COMMANDS', () => {
    const appCmd = BOT_COMMANDS.find((c) => c.command === 'app');
    assert.ok(appCmd, 'Phải có lệnh /app trong BOT_COMMANDS');
    assert.match(appCmd.description, /Mini App/, 'Mô tả phải nhắc đến Mini App');
  });

  await t.test('app.mjs routes /screen-mini and /tunnel properly', () => {
    const routesDirectory = join(projectDirectory, 'src/http/routes');
    const appContent = readdirSync(routesDirectory, { recursive: true }).filter((name) => name.endsWith('.mjs')).map((name) => readFileSync(join(routesDirectory, name), 'utf8')).join('\n');
    assert.match(appContent, /\/screen-mini/, 'app.mjs phải có route /screen-mini');
    assert.match(appContent, /\/tunnel/, 'app.mjs phải có route /tunnel');
    assert.match(appContent, /startTunnel/, 'app.mjs phải gọi startTunnel');
  });
});

test('Mini mở đúng danh sách từ cú bấm tay và chỉ báo thành công khi tab đã nhận lựa chọn', {
  skip: !existsSync(chromium.executablePath()),
}, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<button id="viewport">Màn hình</button><div id="selectModal" style="display:none"><div id="selectModalOptions"></div></div><p id="notice"></p>');
  await page.addScriptTag({ content: `
    const viewport = document.getElementById('viewport');
    const touchStartTime = 0, canvasNaturalWidth = 300, canvasNaturalHeight = 200;
    const getCanvasPoint = () => ({ x: 10, y: 20 }), showTouchRipple = () => {};
    const showToast = (message) => { document.getElementById('notice').textContent = message; };
    window.sent = [];
    window.sendInput = async (body) => {
      if (body.type === 'mousedown') return { select: { uid: 'test-select', selectedIndex: 0,
        options: [{ label: 'Đang chọn' }, { label: 'Mục khóa', disabled: true }, { label: 'A < B & C' }] } };
      window.sent.push(body);
      return window.sent.length === 1 ? { error: 'select không còn' } : { ok: true };
    };
  ` });
  for (const file of ['setup/select-modal.js', 'setup/select-modal-options.js', 'setup/window-close-select-modal-select-modal.js',
    'functions/open-select-picker.js', 'setup/window-select-picker-option-idx.js', 'setup/click-mousedown.js']) {
    await page.addScriptTag({ path: join(projectDirectory, 'ui/mini', file) });
  }
  const screen = page.getByRole('button', { name: 'Màn hình' });
  await screen.click();
  assert.equal(await page.getByRole('button', { name: 'Mục khóa' }).isDisabled(), true);
  const option = page.getByRole('button', { name: 'A < B & C', exact: true });
  await option.click();
  assert.match(await page.locator('#notice').textContent(), /Chưa chọn được mục/);
  await screen.click();
  await option.click();
  assert.equal(await page.locator('#notice').textContent(), 'Đã chọn mục');
  assert.deepEqual(await page.evaluate(() => window.sent), [
    { type: 'select', index: 2, uid: 'test-select' }, { type: 'select', index: 2, uid: 'test-select' },
  ]);
});

test('Mini quy đổi đúng điểm chạm trên frame portrait mobile/tablet', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div id="viewport" style="width:300px;height:500px"><canvas id="streamCanvas"></canvas></div>');
  for (const file of ['setup/canvas-natural-width.js', 'setup/canvas-natural-height.js', 'setup/zoom-scale.js',
    'setup/zoom-pan-x.js', 'setup/viewport.js', 'functions/get-canvas-point.js']) {
    await page.addScriptTag({ path: join(projectDirectory, 'ui/mini', file) });
  }
  assert.equal(await page.evaluate(() => getCanvasPoint(150, 250)), null, 'Chưa có frame thì không được gửi điểm chạm mặc định');
  await page.addScriptTag({ content: 'canvasNaturalWidth = 393; canvasNaturalHeight = 659;' });
  const point = await page.evaluate(() => {
    const rect = viewport.getBoundingClientRect();
    return getCanvasPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  assert.ok(point.x >= 190 && point.x <= 202, `X phải theo frame portrait, nhận ${point.x}`);
  assert.ok(point.y >= 320 && point.y <= 338, `Y phải theo frame portrait, nhận ${point.y}`);
});
