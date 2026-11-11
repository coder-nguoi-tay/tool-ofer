import { test } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.match(content, /id="cbxCloakBrowser"/, 'Phải có checkbox CloakBrowser');
    assert.match(content, /id="cbxDataSaver"/, 'Phải có checkbox Tiết kiệm data');
    assert.match(content, /id="cbxCheckDuplicateIP"/, 'Phải có checkbox Check duplicate IP');
    assert.match(content, /id="cbxHideUntilTarget"/, 'Phải có checkbox Ẩn đến trang đích');
    assert.match(content, /id="cbxHideUntilLead"/, 'Phải có checkbox Chỉ hiện khi có Lead');
    assert.match(content, /id="cbxCheckLead"/, 'Phải có checkbox Check Lead (20s)');
    assert.match(content, /id="cbxAiAssist"/, 'Phải có checkbox AI Assist');
    assert.match(content, /id="cbxRRS"/, 'Phải có checkbox Save RRS');
    assert.match(content, /id="chkAutoRefill"/, 'Phải có checkbox Tự bù luồng');
    assert.match(content, /id="cbxAutoSubmit"/, 'Phải có checkbox Tự submit form');

    // 7. Platform Checkboxes
    assert.match(content, /id="chkWindows"/, 'Phải có platform Windows');
    assert.match(content, /id="chkMac"/, 'Phải có platform Mac');
    assert.match(content, /id="chkLinux"/, 'Phải có platform Linux');
    assert.match(content, /id="chkAndroid"/, 'Phải có platform Android');
    assert.match(content, /id="chkIphone"/, 'Phải có platform iPhone');
    assert.match(content, /id="chkIpad"/, 'Phải có platform iPad');

    // 8. Advanced Parity Features
    assert.match(content, /id="pillBrowserAdsPower"/, 'Phải có chọn AdsPower');
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
