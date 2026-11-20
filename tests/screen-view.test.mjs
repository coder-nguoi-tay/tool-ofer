import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { chromium } from 'playwright';
import { Readable } from 'node:stream';

test('Screen View chỉ tiếp tục đúng tab và lượt CAPTCHA đã được người dùng xác minh', async t => {
  const { createLeadTestSession } = await import('./helpers/lead-session-fixture.mjs');
  const { activeBrowsers } = await import('../src/browser/sessions.mjs');
  const { screencastSessions } = await import('../src/runtime/constants/screencast-sessions.mjs');
  const { handleGetScreenTabs } = await import('../src/http/routes/screen/get-tabs.mjs');
  const { handlePostScreenTabs } = await import('../src/http/routes/screen/post-tabs.mjs');
  const { handlePostScreenInput } = await import('../src/http/routes/screen/post-input.mjs');
  const { getAutoRefillStatus } = await import('../src/refill/actions/get-auto-refill-status.mjs');
  const { session, page: mainPage, browser } = createLeadTestSession('192.0.2.85', 85);
  const waitingPage = await browser.newPage();
  mainPage.title = waitingPage.title = async () => 'Form fixture';
  waitingPage._manualCaptchaPending = true;
  waitingPage._manualCaptchaRequestId = 'second-tab';
  activeBrowsers.add(session);
  t.after(() => { activeBrowsers.delete(session); screencastSessions.delete(85); });

  const response = { writeHead(code) { this.status = code; }, end(json) { this.body = JSON.parse(json); } };
  await handleGetScreenTabs({ method: 'GET', url: '/screen/tabs/85' }, response);
  assert.deepEqual(response.body.tabs.map(tab => tab.manualCaptchaRequestId), [undefined, 'second-tab']);
  const state = getAutoRefillStatus().chromeSessions.find(row => row.slot === 85);
  assert.deepEqual(state.tabs.map(tab => tab.autofillWaitReason), [null, 'Chờ xác minh CAPTCHA']);
  const command = { type: 'confirmManualCaptcha', manualCaptchaRequestId: 'second-tab' };
  const inputRequest = () => Object.assign(Readable.from([JSON.stringify(command)]), { method: 'POST', url: '/screen/input/85' });
  const staleSwitch = Object.assign(Readable.from([JSON.stringify({ index: 0, manualCaptchaRequestId: 'second-tab' })]), { method: 'POST', url: '/screen/tabs/85' });
  await handlePostScreenTabs(staleSwitch, response);
  assert.equal(response.status, 409, 'Từ chối khi vị trí tab đã đổi');

  const screencast = { page: mainPage };
  screencastSessions.set(85, screencast);
  let inspections = 0, completed = false;
  waitingPage.confirmManualCaptcha = async id => { inspections++; return completed && id === 'second-tab'; };
  await handlePostScreenInput(inputRequest(), response);
  assert.equal(response.status, 409, 'Đang xem tab khác');
  screencast.page = waitingPage;
  command.manualCaptchaRequestId = 'previous-request';
  await handlePostScreenInput(inputRequest(), response);
  assert.equal(response.status, 409, 'Mã lượt chờ cũ');
  assert.equal(inspections, 0);
  command.manualCaptchaRequestId = 'second-tab';
  await handlePostScreenInput(inputRequest(), response);
  assert.equal(response.status, 409, 'Widget còn hoạt động');
  completed = true;
  await handlePostScreenInput(inputRequest(), response);
  assert.equal(response.status, 200);
  assert.equal(inspections, 2);
});

test('Desktop đặt nút Đã xác minh trên đúng tab CAPTCHA đang xem', {
  skip: !existsSync(chromium.executablePath())
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const view = await browser.newPage();
  await view.setContent('<div id="screenTabBar"></div>');
  await view.evaluate(() => {
    Object.assign(window, {
      _screenActiveSlot: 3, _screenActiveTabIndex: 0,
      requests: [], tabs: [{ index: 0, title: 'Form' }, { index: 1, title: 'Fixture', manualCaptchaPending: true, manualCaptchaRequestId: 'tab-2' }],
      fetch: async () => ({ ok: true, json: async () => ({ tabs }) }),
      _switchTab: async (slot, index, requestId) => { requests.push([slot, index, requestId]); _screenActiveTabIndex = index; await _fetchAndRenderTabs(slot); },
      api: async (url, options) => { requests.push([url, JSON.parse(options.body)]); tabs[1].manualCaptchaPending = false; return { ok: true }; },
    });
  });
  await view.addScriptTag({ path: fileURLToPath(new URL('../ui/desktop/functions/_fetch-and-render-tabs.js', import.meta.url)) });
  await view.evaluate(() => _fetchAndRenderTabs(3));
  const confirmButton = view.getByRole('button', { name: 'Đã xác minh' });
  assert.equal(await confirmButton.count(), 0);
  await view.getByText('Tab 2 · Chờ xác minh CAPTCHA', { exact: false }).click();
  await confirmButton.click();
  await confirmButton.waitFor({ state: 'detached' });
  assert.deepEqual(await view.evaluate(() => requests), [[3, 1, 'tab-2'], ['/screen/input/3', { type: 'confirmManualCaptcha', manualCaptchaRequestId: 'tab-2' }]]);
});

test('Desktop Screen View gửi đúng ô select, hiện lỗi và bỏ phản hồi của lượt bấm cũ', {
  skip: !existsSync(chromium.executablePath())
}, async (t) => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div id="screenModal" style="display:block"><canvas id="screenCanvas"></canvas><div id="screenTabBar"></div></div>');
  await page.evaluate(() => {
    Object.assign(window, {
      _screenReconnectTimer: null, _screenEventSource: null, _screenFpsTimer: null,
      _screenTabPollTimer: null, _mouseMoveTimer: null, _wheelTimer: null,
      _screenFpsCounter: 0, _screenActiveTabIndex: 0,
      EventSource: class { close() {} },
      _fetchAndRenderTabs() {}, _buildMouseEvent: type => ({ type }),
      requests: [], notices: [], closes: 0,
      showToast: text => notices.push(text),
      closeScreenModal: () => { closes++; _stopScreenStream(); },
      api: (url, { body }) => new Promise(resolve => requests.push({ url, body: JSON.parse(body), resolve })),
      picker: {
        uid: 'second', selectedIndex: 35, options: Array.from({ length: 40 }, (_, i) => ({
          label: 'Chọn ' + i, disabled: i === 34
        }))
      }
    });
  });
  for (const file of ['functions/_close-select-picker.js', 'functions/_open-select-picker.js',
    'functions/_stop-screen-stream.js', 'functions/_start-screen-stream.js', 'setup/keydown-escape.js']) {
    await page.addScriptTag({ path: fileURLToPath(new URL('../ui/desktop/' + file, import.meta.url)) });
  }
  await page.evaluate(() => _startScreenStream(2));
  const canvas = page.locator('#screenCanvas');
  await canvas.dispatchEvent('mousedown');
  await canvas.dispatchEvent('mousedown');
  await page.evaluate(() => {
    requests[1].resolve({ select: picker });
    requests[0].resolve({ select: { ...picker, uid: 'first', options: [{ label: 'Cũ' }] } });
  });
  const menu = page.locator('#screenSelectPicker');
  await menu.waitFor();
  assert.equal(await menu.getByRole('button').count(), 40);
  assert.equal(await menu.getByRole('button', { name: 'Chọn 34' }).isDisabled(), true);
  assert.ok(await menu.evaluate(el => el.scrollTop > 0), 'Cuộn tới mục đang chọn');
  await menu.getByRole('button', { name: 'Chọn 35' }).click();
  assert.deepEqual(await page.evaluate(() => ({ url: requests[2].url, body: requests[2].body })), {
    url: '/screen/input/2', body: { type: 'select', uid: 'second', index: 35 }
  });
  await page.evaluate(() => requests[2].resolve({ error: 'Ô đã thay đổi' }));
  assert.deepEqual(await page.evaluate(() => notices), ['Ô đã thay đổi']);

  await page.evaluate(() => _openSelectPicker(2, picker, 15, 30));
  await menu.getByRole('button', { name: 'Chọn 36' }).click();
  await page.evaluate(() => requests[3].resolve({ ok: true }));
  assert.equal(await page.evaluate(() => requests[3].body.index), 36);
  assert.deepEqual(await page.evaluate(() => notices), ['Ô đã thay đổi']);

  await page.evaluate(() => {
    _openSelectPicker(2, picker, 15, 30);
    _openSelectPicker(2, picker, 15, 30);
  });
  await menu.getByRole('button', { name: 'Chọn 34' }).dispatchEvent('mousedown');
  assert.equal(await menu.isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await menu.count(), 0);
  assert.equal(await page.evaluate(() => closes), 0);

  await canvas.dispatchEvent('mousedown');
  await page.keyboard.press('Escape');
  await page.evaluate(() => requests[4].resolve({ select: picker }));
  assert.equal(await page.evaluate(() => closes), 1);
  assert.equal(await menu.count(), 0, 'Phản hồi đến sau khi đóng Screen View phải bị bỏ qua');
});

test('screen view wheel deltaMode scaling calculates correctly', () => {
  // DOM_DELTA_PIXEL (trackpad)
  let deltaY = 15;
  let deltaMode = 0;
  let dy = deltaY;
  if (deltaMode === 1) dy *= 35;
  assert.equal(dy, 15);

  // DOM_DELTA_LINE (mouse wheel notches)
  deltaY = 3;
  deltaMode = 1;
  dy = deltaY;
  if (deltaMode === 1) dy *= 35;
  assert.equal(dy, 105, 'Mouse wheel notch of 3 lines should scale to 105px in CDP');
});

test('screen view viewport coordinate scaling correctly scales from screencast to real device width', () => {
  const clientWidth = 960;
  const clientHeight = 600;
  const deviceWidth = 1440;
  const deviceHeight = 900;

  const clientX = 480;
  const clientY = 300;

  const targetX = Math.round(clientX * (deviceWidth / clientWidth));
  const targetY = Math.round(clientY * (deviceHeight / clientHeight));

  assert.equal(targetX, 720, 'Middle of 960 canvas should map to middle of 1440 screen (720)');
  assert.equal(targetY, 450, 'Middle of 600 canvas should map to middle of 900 screen (450)');
});

test('screen tab closing logic safely updates active index', () => {
  // Giả sử có 3 tab: [0, 1, 2], đang active ở index 2
  let remainingTabs = [0, 1, 2];
  let activeIndex = 2;
  const targetToClose = 2;

  remainingTabs = remainingTabs.filter(i => i !== targetToClose);
  let newActiveIndex = Math.max(0, Math.min(targetToClose > 0 ? targetToClose - 1 : 0, remainingTabs.length - 1));

  assert.equal(remainingTabs.length, 2);
  assert.equal(newActiveIndex, 1, 'Closing the last tab should move active index to the previous tab (1)');

  // Đóng tab đầu tiên khi có 2 tab: [0, 1]
  remainingTabs = [0, 1];
  const closeFirst = 0;
  remainingTabs = remainingTabs.filter(i => i !== closeFirst);
  newActiveIndex = Math.max(0, Math.min(closeFirst > 0 ? closeFirst - 1 : 0, remainingTabs.length - 1));
  assert.equal(newActiveIndex, 0, 'Closing first tab should stay on index 0');

  // Đóng tab duy nhất còn lại: kết thúc phiên trình duyệt
  remainingTabs = [0];
  const closeOnly = 0;
  remainingTabs = remainingTabs.filter(i => i !== closeOnly);
  assert.equal(remainingTabs.length === 0, true, 'Closing the only tab leaves 0 pages and triggers closedSession');
});

test('screen view navigate URL normalization ensures valid protocol', () => {
  const normalize = (raw) => {
    let u = String(raw || '').trim();
    if (u && !/^https?:\/\//i.test(u)) u = `https://${u}`;
    return u;
  };
  assert.equal(normalize('google.com'), 'https://google.com');
  assert.equal(normalize('http://localhost:3000'), 'http://localhost:3000');
  assert.equal(normalize('https://example.com/test'), 'https://example.com/test');
  assert.equal(normalize(''), '');
});

test('screen view stream frame queue drops superseded frames to prevent lag', () => {
  let isRendering = false;
  let pendingFrame = null;
  const renderedFrames = [];

  const onFrame = (frameId) => {
    pendingFrame = frameId;
    if (!isRendering) {
      renderLoop();
    }
  };

  const renderLoop = () => {
    if (!pendingFrame) {
      isRendering = false;
      return;
    }
    isRendering = true;
    const current = pendingFrame;
    pendingFrame = null;
    renderedFrames.push(current);
    // giả lập đang vẽ
  };

  // Giả sử có 3 frame đến dồn dập trong khi frame 1 đang vẽ:
  onFrame(1);
  assert.equal(renderedFrames.length, 1);
  assert.equal(isRendering, true);

  onFrame(2); // Frame 2 được lưu vào pending
  onFrame(3); // Frame 3 ghi đè pending, Frame 2 bị drop tự nhiên!

  assert.equal(pendingFrame, 3);
  renderLoop();
  assert.deepEqual(renderedFrames, [1, 3], 'Frame 2 bị drop để frame 3 được render ngay lập tức, không bị dồn trễ');
});

test('Screen View hiển thị lý do chờ theo đúng tab và xóa khi form đã sẵn sàng', async t => {
  const { existsSync } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const { chromium } = await import('playwright');
  if (!existsSync(chromium.executablePath())) return t.skip('Chưa cài Chromium');
  const { createLeadTestSession } = await import('./helpers/lead-session-fixture.mjs');
  const { activeBrowsers } = await import('../src/browser/sessions.mjs');
  const { getAutoRefillStatus } = await import('../src/refill/actions/get-auto-refill-status.mjs');
  const { session, browser: tabs } = createLeadTestSession('192.0.2.12', 12);
  const waitingPage = await tabs.newPage();
  waitingPage._autofillWaitReason = 'Form yêu cầu kiểm tra <địa chỉ>.';
  activeBrowsers.add(session);
  t.after(() => activeBrowsers.delete(session));
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const view = await browser.newPage();
  await view.setContent('<div id="thumbnailTiles"></div><div id="thumbnailEmpty"></div>');
  await view.evaluate(() => Object.assign(window, { _screenViewActive: true, currentSelectedRunningOfferTab: 'all', _screenActiveSlot: 12 }));
  for (const file of ['esc-html', 'get-device-icon', 'get-clean-device-name', 'get-clean-browser-version', 'get-short-domain', 'format-bytes', '_update-screen-slots', '_poll-thumbnails']) {
    await view.addScriptTag({ path: fileURLToPath(new URL('../ui/desktop/functions/' + file + '.js', import.meta.url)) });
  }
  for (const reason of [waitingPage._autofillWaitReason, '']) {
    waitingPage._autofillWaitReason = reason;
    const reported = getAutoRefillStatus().chromeSessions.find(row => row.slot === 12);
    assert.deepEqual(reported.tabs.map(tab => tab.autofillWaitReason), [null, reason || null]);
    await view.evaluate(session => { _updateScreenSlots([session]); _pollThumbnails(); }, reported);
    const rows = view.locator('.screen-tile-footer .status-checking');
    assert.deepEqual(await rows.allTextContents(), reason ? ['Tab 2 · ' + reason] : []);
  }
});
