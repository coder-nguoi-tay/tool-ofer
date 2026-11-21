import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getTunnelUrl, startTunnel, stopTunnel } from "../tunnel.mjs";
import { BOT_COMMANDS } from "../tgbot.mjs";
import { captureManualTextField, useFocusedManualTextField } from '../src/browser/screen/manual-text-field.mjs';

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
    assert.match(content, /type: 'click'/, 'Phải gửi trọn cú bấm tới tab đang xem');
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
    const canvas = { dataset: { screenSourceId: 'fixture-source' } };
    const touchStartTime = 0, canvasNaturalWidth = 300, canvasNaturalHeight = 200;
    const getCanvasPoint = () => ({ x: 10, y: 20 }), showTouchRipple = () => {};
    const showToast = (message) => { document.getElementById('notice').textContent = message; };
    window.sent = [];
    window.sendInput = async (body) => {
      if (body.type === 'click') return { select: { uid: 'test-select', selectedIndex: 0,
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
    { type: 'select', index: 2, uid: 'test-select', screenSourceId: 'fixture-source' }, { type: 'select', index: 2, uid: 'test-select', screenSourceId: 'fixture-source' },
  ]);
});

test('Mini chỉ cho trả lời hộp thoại trên tab đang xem của slot', {
  skip: !existsSync(chromium.executablePath()),
}, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div id="browserTabsBar"></div>');
  await page.addScriptTag({ content: `
    let currentSlot = 1, currentSlotTabs = [];
    let activeTabIndex = 0;
    const replies = [];
    const browserTabsBar = document.getElementById('browserTabsBar');
    window.prompt = (_, defaultValue) => defaultValue;
    window.fetch = async (url, options) => {
      if (options) replies.push(JSON.parse(options.body));
      return { ok: true, json: async () => ({ tabs: [
        { index: 0, active: activeTabIndex === 0, title: 'A <b>B</b> & C' },
        { index: 1, active: activeTabIndex === 1, title: 'Tab sau',
          manualDialog: { id: 'fixture-dialog', type: 'prompt', message: 'Ghi chú', defaultValue: 'Giá trị đã nhập' } }
      ] }) };
    };
  ` });
  await page.addScriptTag({ path: join(projectDirectory, 'ui/mini/functions/poll-slot-tabs.js') });
  await page.evaluate(() => pollSlotTabs(1));
  assert.equal(await page.locator('.browser-tab-chip.active span').first().textContent(), '🌐 A <b>B</b> & C');
  const reply = page.getByRole('button', { name: /Trả lời hộp thoại/ });
  assert.equal(await reply.count(), 0);
  await page.evaluate(async () => {
    activeTabIndex = 1;
    await pollSlotTabs(1);
  });
  await reply.click();
  assert.deepEqual(await page.evaluate(() => replies), [{
    type: 'dialog', dialogId: 'fixture-dialog', accept: true, promptText: 'Giá trị đã nhập',
  }]);
  // Phản hồi poll của slot cũ đến muộn sau khi người dùng đã chọn slot khác.
  await page.evaluate(async () => {
    const originalFetch = window.fetch;
    let finishOldPoll;
    window.fetch = () => new Promise(resolve => { finishOldPoll = resolve; });
    const oldPoll = pollSlotTabs(1);
    currentSlot = 2;
    window.fetch = originalFetch;
    await pollSlotTabs(2);
    finishOldPoll({ ok: false });
    await oldPoll;
  });
  assert.equal(await reply.isVisible(), true);
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

test('Mini giữ bản nháp khi đổi ô cùng tab và chỉ xử lý phản hồi của lần mở hiện tại', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div id="typeModal" style="display:none"><input id="modalTextInput"><button id="btnModalSendText" onclick="submitModalText()">Gửi</button><div id="modalTextActions"><button onclick="modalTextInput.value=\'\'">Xóa</button></div></div><p id="notice"></p>');
  await page.addScriptTag({ content: `
    const canvas = { dataset: { screenSourceId: 'cung-tab' } };
    const notice = document.getElementById('notice');
    const showToast = message => { notice.textContent = message; };
    const sent = [];
    const sendInput = body => new Promise(resolve => sent.push({ body, resolve }));
  ` });
  for (const file of ['window-open-type-modal-modal', 'window-close-type-modal-modal', 'window-submit-modal-text-input']) {
    await page.addScriptTag({ path: join(projectDirectory, 'ui/mini/setup', file + '.js') });
  }
  const draft = page.locator('#modalTextInput');

  await page.evaluate(() => openTypeModal({ name: 'Thiếu mã ô' }));
  assert.equal(await draft.isVisible(), false);
  await page.evaluate(() => openTypeModal({ fieldId: 'field-A', name: 'Tên' }));
  await draft.fill('Bản nháp');
  await page.evaluate(() => { window.pendingA = submitModalText(); closeTypeModal(); openTypeModal({ fieldId: 'field-B', name: 'Phố' }); });
  await draft.fill('Bản nháp');
  await page.evaluate(async () => {
    window.pendingB = submitModalText();
    sent[0].resolve({ ok: true });
    await pendingA;
  });
  assert.equal(await draft.isVisible(), true, 'Phản hồi gửi ở ô A không được đóng hộp của ô B');
  assert.equal(await draft.inputValue(), 'Bản nháp');
  assert.equal(await draft.isEditable(), false, 'Lần gửi trước không được mở khóa bản nháp đang gửi ở ô mới');
  assert.equal(await page.getByRole('button', { name: 'Gửi' }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Xóa' }).isDisabled(), true);
  await draft.press('End');
  await draft.pressSequentially('h');
  await page.evaluate(async () => { await submitModalText(); await pressModalKey('Tab'); });
  assert.equal(await draft.inputValue(), 'Bản nháp', 'Không gộp phần đã gửi vào lần nhập kế trong khi chờ mạng');
  assert.deepEqual(await page.evaluate(() => sent.map(r => r.body.fieldId)), ['field-A', 'field-B']);

  await page.evaluate(async () => {
    sent[1].resolve({ error: 'Ô đã đổi focus' });
    await pendingB;
    const key = pressModalKey('Enter');
    sent[2].resolve({ error: 'Ô đã đổi focus' });
    await key;
  });
  assert.equal(await draft.inputValue(), 'Bản nháp');
  assert.equal(await draft.isEditable(), true);
  assert.equal(await page.getByRole('button', { name: 'Gửi' }).isEnabled(), true);
  assert.deepEqual(await page.evaluate(() => sent[2].body), {
    type: 'press', key: 'Enter', fieldId: 'field-B', screenSourceId: 'cung-tab',
  });
  await page.evaluate(() => { closeTypeModal(); openTypeModal(); });
  await draft.fill('Chèn tại con trỏ');
  await page.evaluate(async () => {
    const submission = submitModalText();
    sent[3].resolve({ ok: true });
    await submission;
  });
  assert.deepEqual(await page.evaluate(() => sent[3].body), {
    type: 'insertText', text: 'Chèn tại con trỏ', screenSourceId: 'cung-tab',
  });
});

test('Mini chỉ tạo nút điền nhanh cho giá trị hiện có và chèn nguyên văn khi người dùng chọn', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div id="autofillChipsContainer"></div>');
  await page.addScriptTag({ content: `
    const currentSlot = 2;
    const activeSessions = [{slot: 2, autofillRecord: 37, assignedEmail: 'demo@example.invalid', assignedPass: '******'}];
    const inserted = [];
    const injectAutofillText = text => inserted.push(text);
  ` });
  await page.addScriptTag({ path: join(projectDirectory, 'ui/mini/functions/update-smart-autofill-chips.js') });
  await page.evaluate(() => updateSmartAutofillChips());
  assert.equal(await page.locator('.autofill-chip').count(), 1);
  await page.locator('.chip-email').click();
  await page.evaluate(() => {
    activeSessions[0].autofillRecord = { lastname: "O'Neil <b>" };
    activeSessions[0].assignedPass = "fixture'private";
    updateSmartAutofillChips();
  });
  assert.deepEqual(await page.evaluate(() => inserted), ['demo@example.invalid']);
  assert.equal(await page.locator('.chip-name b').count(), 0);
  assert.doesNotMatch(await page.locator('#autofillChipsContainer').innerHTML(), /fixture|onclick=/);
  await page.locator('.chip-name').click();
  await page.locator('.chip-pass').click();
  assert.deepEqual(await page.evaluate(() => inserted), ['demo@example.invalid', "O'Neil <b>", "fixture'private"]);
});

test('Mini chèn cột hồ sơ theo lựa chọn của người dùng vào đúng ô đang xem', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  const html = readFileSync(join(projectDirectory, 'ui/mini/index.html'), 'utf8');
  await page.evaluate(markup => {
    const source = document.createElement('template');
    source.innerHTML = markup;
    document.body.append(source.content.querySelector('#typeModal'));
  }, html);
  await page.addScriptTag({ content: `
    const canvas = { dataset: { screenSourceId: 'source-A' } };
    const sent = [];
    const showToast = () => {};
    const sendInput = body => new Promise(resolve => sent.push({ body, resolve }));
  ` });
  for (const file of ['window-open-type-modal-modal', 'window-close-type-modal-modal', 'window-submit-modal-text-input']) {
    await page.addScriptTag({ path: join(projectDirectory, 'ui/mini/setup', file + '.js') });
  }
  const picker = page.getByRole('combobox', { name: 'Cột hồ sơ' });
  const insert = page.getByRole('button', { name: 'Chèn từ hồ sơ' });
  const key = "Trường 'mẫu' <b>";
  await page.evaluate(column => openTypeModal({ fieldId: 'field-A', recordFields: [column] }), key);
  assert.equal(await picker.isVisible(), true);
  assert.equal(await picker.inputValue(), '');
  await picker.selectOption(key);
  assert.deepEqual(await page.evaluate(() => sent), []);
  await page.evaluate(() => { canvas.dataset.screenSourceId = 'source-B'; });
  await insert.click();
  assert.deepEqual(await page.evaluate(() => sent), []);
  await page.evaluate(() => { canvas.dataset.screenSourceId = 'source-A'; });
  await insert.click();
  assert.equal(await insert.isDisabled(), true);
  assert.equal(await picker.isDisabled(), true);
  await page.evaluate(() => { document.getElementById('btnModalInsertRecord').click(); });
  assert.deepEqual(await page.evaluate(() => sent.map(request => request.body)), [
    { type: 'insertRecordField', recordField: key, screenSourceId: 'source-A', fieldId: 'field-A' },
  ]);
  await page.evaluate(() => sent[0].resolve({ ok: false }));
  assert.equal(await picker.inputValue(), key);
  await insert.click();
  await page.evaluate(() => sent[1].resolve({ ok: true }));
  assert.equal(await picker.isVisible(), false);
  await page.evaluate(() => openTypeModal({ fieldId: 'field-B' }));
  assert.equal(await picker.isVisible(), false);
  assert.equal(await page.locator('#modalRecordField option').count(), 0);
});

test('Mini xác nhận đủ nội dung sau khi form xử lý input và giữ vị trí chỉnh sửa do trình duyệt đặt', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<input id="plain" value="abc"><input id="telephone" type="tel"><div id="rich" contenteditable>ab<span>cd</span>ef</div>');
  const plain = page.locator('#plain'), rich = page.locator('#rich'), telephone = page.locator('#telephone');
  const insert = text => page.evaluate(useFocusedManualTextField, { fieldId: 'fixture', text });
  await plain.evaluate(captureManualTextField, 'fixture');
  await plain.focus();
  for (const fallback of [false, true]) {
    await plain.evaluate((field, fallback) => {
      if (fallback) document.queryCommandSupported = () => false;
      field.value = 'abc';
      field.setSelectionRange(3, 3);
      field.oninput = () => { field.value = field.value.slice(0, 4); };
    }, fallback);
    assert.equal(await insert('XYZ'), false);
    assert.equal(await plain.inputValue(), 'abcX');
    await plain.evaluate(field => {
      field.value = 'abc';
      field.setSelectionRange(1, 2);
      field.oninput = () => { field.value = field.value.toUpperCase(); };
    });
    assert.equal(await insert('mn'), true);
    assert.equal(await plain.inputValue(), 'AMNC');
  }
  await page.evaluate(() => { delete document.queryCommandSupported; });
  await plain.evaluate(field => {
    field.select();
    field.oninput = () => document.getElementById('telephone').focus();
  });
  assert.equal(await insert('abc'), true, 'Form giữ dữ liệu và chuyển focus sang ô kế tiếp sau khi nhập');
  assert.equal(await plain.inputValue(), 'abc');
  await plain.focus();
  await plain.evaluate(field => {
    field.select();
    field.oninput = () => queueMicrotask(() => {
      const replacement = field.cloneNode();
      replacement.value = 'abc';
      field.replaceWith(replacement);
    });
  });
  assert.equal(await insert('RST'), false, 'Node cũ còn giữ RST trong bộ nhớ nhưng form đã thay ô và khôi phục abc');
  assert.equal(await plain.inputValue(), 'abc');
  await telephone.evaluate(captureManualTextField, 'fixture');
  await telephone.focus();
  await telephone.evaluate(field => { field.oninput = () => { field.value = field.value.replace(/^(\d{3})(\d{3})(\d{4})$/, '($1) $2-$3'); }; });
  assert.equal(await insert('1234567890'), true);
  assert.equal(await telephone.inputValue(), '(123) 456-7890');

  await rich.evaluate(captureManualTextField, 'fixture');
  await rich.focus();
  await rich.evaluate(field => {
    const range = document.createRange();
    range.selectNodeContents(field.querySelector('span'));
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
  assert.equal(await insert('XYZ'), true);
  assert.equal(await rich.innerText(), 'abXYZef');
  assert.equal(await insert('!'), true, 'Lần sau chèn ngay sau phần thay thế, trước ef');
  assert.equal(await rich.innerText(), 'abXYZ!ef');
  await rich.evaluate(field => { field.oninput = () => { field.textContent = 'abXYZ!ef'; }; });
  assert.equal(await insert('RST'), false);
  assert.equal(await rich.innerText(), 'abXYZ!ef');
  await rich.evaluate(field => { field.oninput = () => queueMicrotask(() => { field.textContent = 'abXYZ!ef'; }); });
  assert.equal(await insert('RST'), false, 'Form đã xếp cập nhật trong microtask của sự kiện input');
});

test('Mini đợi vẽ ảnh tab mới khi ảnh tab cũ đang giải mã trên cùng kết nối', async () => {
  const { createContext, runInContext } = await import('node:vm');
  const viewer = createContext({
    canvas: { dataset: {}, width: 300, height: 200 }, canvasMsg: { style: {} }, urlDisplay: {}, ipDisplay: {},
    activeSessions: [], currentInteractionMode: 'touch', isRendering: false, _imgDecoding: false, fpsCount: 0,
    pendingFrame: null, eventSource: null, reconnectTimer: null, currentSlot: 1,
    canvasNaturalWidth: 0, canvasNaturalHeight: 0,
    Image: class {}, EventSource: class {}, _streamBufferImg: { naturalWidth: 300, naturalHeight: 200 },
    ctx: { drawImage() {} }, document: { getElementById: () => null }, _scheduleMiniRender: render => render(),
    renderSlotPills() {}, pollSlotTabs() {}, updateSmartAutofillChips() {}, resetZoom() {},
  });
  for (const file of ['functions/start-stream', 'functions/render-next-frame', 'setup/stream-buffer-img-onload-img-decoding']) {
    runInContext(readFileSync(join(projectDirectory, 'ui/mini', file + '.js'), 'utf8'), viewer);
  }
  viewer.startStream(1);
  const frame = source => viewer.eventSource.onmessage({ data: 'fixture', lastEventId: source });
  frame('trước');
  viewer._streamBufferImg.onload();
  assert.equal(viewer.canvas.dataset.screenSourceId, 'trước');
  frame('trước');
  frame('sau');
  assert.equal(viewer.canvas.dataset.screenSourceId, undefined);
  viewer._streamBufferImg.onload();
  assert.equal(viewer.fpsCount, 1, 'Không vẽ ảnh còn đang giải mã của tab trước');
  assert.equal(viewer.canvas.dataset.screenSourceId, undefined);
  viewer._streamBufferImg.onload();
  assert.equal(viewer.canvas.dataset.screenSourceId, 'sau');
  assert.equal(viewer.fpsCount, 2);
});
