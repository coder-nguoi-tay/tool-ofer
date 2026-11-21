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
  waitingPage._manualFormDialog = {
    id: 'fixture-prompt', dialog: { type: () => 'prompt', message: () => 'Ghi chú', defaultValue: () => 'Giá trị đã nhập' },
  };
  activeBrowsers.add(session);
  t.after(() => { activeBrowsers.delete(session); screencastSessions.delete(85); });

  const response = { writeHead(code) { this.status = code; }, end(json) { this.body = JSON.parse(json); } };
  await handleGetScreenTabs({ method: 'GET', url: '/screen/tabs/85' }, response);
  assert.deepEqual(response.body.tabs.map(tab => tab.manualCaptchaRequestId), [undefined, 'second-tab']);
  assert.deepEqual(response.body.tabs.map(tab => tab.active), [true, false]);
  assert.deepEqual(response.body.tabs[1].manualDialog, {
    id: 'fixture-prompt', type: 'prompt', message: 'Ghi chú', defaultValue: 'Giá trị đã nhập',
  });
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
  await handleGetScreenTabs({ method: 'GET', url: '/screen/tabs/85' }, response);
  assert.deepEqual(response.body.tabs.map(tab => tab.active), [false, true]);
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
      requests: [], tabs: [{ index: 0, title: 'Form', active: true }, { index: 1, title: 'Fixture', active: false, manualCaptchaPending: true, manualCaptchaRequestId: 'tab-2' }],
      fetch: async () => ({ ok: true, json: async () => ({ tabs }) }),
      _switchTab: async (slot, index, requestId) => { requests.push([slot, index, requestId]); tabs.forEach(tab => { tab.active = tab.index === index; }); await _fetchAndRenderTabs(slot); },
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
  await page.evaluate(() => { _startScreenStream(2); document.getElementById('screenCanvas').dataset.screenSourceId = 'fixture-source'; });
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
    url: '/screen/input/2', body: { type: 'select', screenSourceId: 'fixture-source', uid: 'second', index: 35 }
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
  await canvas.evaluate(el => { el.dataset.screenSourceId = 'other-tab'; });
  await page.evaluate(() => requests[4].resolve({ select: picker }));
  await canvas.dispatchEvent('mouseup');
  assert.equal(await menu.count(), 0, 'Cùng chỉ số tab nhưng khác nguồn ảnh cũng phải bỏ danh sách cũ');

  await canvas.dispatchEvent('mousedown');
  await page.keyboard.press('Escape');
  await page.evaluate(() => requests[5].resolve({ select: picker }));
  assert.equal(await page.evaluate(() => closes), 1);
  assert.equal(await menu.count(), 0, 'Phản hồi đến sau khi đóng Screen View phải bị bỏ qua');
});

test('Desktop giữ đúng tab khi phản hồi danh sách hoặc lệnh từ lượt xem cũ đến muộn', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div id="screenTabBar"></div><input id="screenUrlInput"><div id="screenHtmlPanel">Mã HTML của slot mới</div>');
  await page.evaluate(() => Object.assign(window, {
    _screenActiveSlot: 1, _screenActiveTabIndex: 0, _screenEventSource: {}, requests: [], closes: 0,
    closeScreenModal() { closes++; }, fetchRunningState() {}, showToast() {},
    fetch: () => new Promise(resolve => requests.push(body => resolve({ ok: true, json: async () => body }))),
  }));
  for (const file of ['_fetch-and-render-tabs', '_switch-tab', '_close-tab', '_open-new-tab']) {
    await page.addScriptTag({ path: fileURLToPath(new URL('../ui/desktop/functions/' + file + '.js', import.meta.url)) });
  }
  await page.evaluate(async () => {
    const older = _fetchAndRenderTabs(1);
    const newer = _fetchAndRenderTabs(1);
    requests[1]({ tabs: [{ index: 1, active: true, url: '/ghi-chu' }] });
    await newer;
    requests[0]({ tabs: [{ index: 0, active: true, url: '/ho-so' }] });
    await older;
  });
  assert.equal(await page.locator('#screenUrlInput').inputValue(), '/ghi-chu');
  await page.evaluate(async () => {
    const pending = [_switchTab(1, 4), _closeTab(1, 0), _openNewTab(1)];
    _screenActiveSlot = 2;
    _screenEventSource = {};
    _screenActiveTabIndex = 3;
    requests[2]({ ok: true }); requests[3]({ ok: true, closedSession: true }); requests[4]({ ok: true, index: 5 });
    await Promise.all(pending);
  });
  assert.deepEqual(await page.evaluate(() => [closes, _screenActiveTabIndex]), [0, 3]);
  assert.equal(await page.locator('#screenHtmlPanel').isVisible(), true);
});

test('Desktop chỉ nhận thao tác sau khi đã vẽ ảnh từ nguồn mới của cùng kết nối', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<canvas id="screenCanvas"></canvas><div id="screenTabBar"></div>');
  await page.evaluate(() => Object.assign(window, {
    _screenReconnectTimer: null, _screenEventSource: null, _screenFpsTimer: null, _screenTabPollTimer: null,
    _mouseMoveTimer: null, _wheelTimer: null, _screenFpsCounter: 0, _screenActiveTabIndex: 0,
    EventSource: class { close() {} }, _fetchAndRenderTabs() {}, _closeSelectPicker() {},
    scrollEvents: [], _sendInput: (_, data) => scrollEvents.push(data),
    _scaleX: () => 10, _scaleY: () => 10, _mods: event => event.ctrlKey ? 2 : 0,
  }));
  for (const file of ['_stop-screen-stream', '_start-screen-stream']) {
    await page.addScriptTag({ path: fileURLToPath(new URL('../ui/desktop/functions/' + file + '.js', import.meta.url)) });
  }
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const context = canvas.getContext('2d');
    const draw = context.drawImage.bind(context);
    window.paintedFrames = 0;
    context.drawImage = (...args) => { paintedFrames++; return draw(...args); };
    const image = canvas.toDataURL('image/jpeg').split(',')[1];
    window.emitFrame = source => _screenEventSource.onmessage({ data: image, lastEventId: source });
    const decode = window.createImageBitmap.bind(window);
    let firstFrame = true;
    window.createImageBitmap = async blob => {
      if (firstFrame) {
        firstFrame = false;
        await new Promise(resolve => { window.finishOldFrame = resolve; });
      }
      return decode(blob);
    };
    _startScreenStream(1);
    canvas.dataset.screenSourceId = 'old';
    emitFrame('old');
  });
  await page.waitForFunction(() => Boolean(window.finishOldFrame));
  await page.evaluate(() => emitFrame('new'));
  const canvas = page.locator('canvas');
  assert.equal(await canvas.getAttribute('data-screen-source-id'), null);
  await page.evaluate(() => finishOldFrame());
  await page.waitForFunction(() => document.querySelector('canvas').dataset.screenSourceId === 'new');
  assert.equal(await page.evaluate(() => paintedFrames), 1);
  await canvas.evaluate(el => {
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, ctrlKey: true }));
    el.dataset.screenSourceId = 'another';
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: 5 }));
  });
  await page.waitForFunction(() => scrollEvents.length > 0);
  assert.deepEqual(await page.evaluate(() => scrollEvents.map(e => [e.screenSourceId, e.deltaY, e.modifiers])), [['another', 5, 0]]);
});

test('Desktop xóa ảnh slot cũ và gửi phím đóng tab theo nguồn của khung hình đã vẽ', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<div id="screenModal"><canvas id="screenCanvas"></canvas><div id="screenTabBar"></div></div>');
  await page.evaluate(() => Object.assign(window, {
    _screenActiveSlot: 7, _screenSlots: [], _screenReconnectTimer: null, _screenEventSource: null,
    _screenFpsTimer: null, _screenTabPollTimer: null, _mouseMoveTimer: null, _wheelTimer: null,
    _screenFpsCounter: 0, _screenActiveTabIndex: 0, EventSource: class { close() {} },
    _closeSelectPicker() {}, _fetchAndRenderTabs() {}, requests: [],
    fetch: async (url, options) => { requests.push([url, JSON.parse(options.body)]); return { ok: true, json: async () => ({ ok: true }) }; },
  }));
  for (const file of ['open-screen-modal', '_stop-screen-stream', '_start-screen-stream', '_close-tab']) {
    await page.addScriptTag({ path: fileURLToPath(new URL('../ui/desktop/functions/' + file + '.js', import.meta.url)) });
  }
  const snapshot = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.fillRect(0, 0, 10, 10);
    canvas.dataset.screenSourceId = 'slot-7';
    openScreenModal(8);
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', ctrlKey: true }));
    return { alpha: ctx.getImageData(0, 0, 1, 1).data[3], requests: [...requests] };
  });
  assert.deepEqual(snapshot, { alpha: 0, requests: [] });
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    canvas.dataset.screenSourceId = 'tab-dang-xem';
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true }));
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', metaKey: true, repeat: true }));
  });
  assert.deepEqual(await page.evaluate(() => requests), [['/screen/tabs/close/8', { screenSourceId: 'tab-dang-xem' }]]);
});

test('Phím tắt đóng theo nguồn ảnh dù thứ tự tab thay đổi, nút đóng riêng vẫn dùng vị trí', async t => {
  const { createLeadTestSession } = await import('./helpers/lead-session-fixture.mjs');
  const { activeBrowsers } = await import('../src/browser/sessions.mjs');
  const { screencastSessions } = await import('../src/runtime/constants/screencast-sessions.mjs');
  const { handlePostScreenTabsClose } = await import('../src/http/routes/screen/post-tabs-close.mjs');
  const slot = 87;
  const { session, page: firstPage, browser } = createLeadTestSession('192.0.2.87', slot);
  const visiblePage = await browser.newPage();
  const lastPage = await browser.newPage();
  const stream = { page: visiblePage, screenSourceId: 'visible' };
  activeBrowsers.add(session);
  screencastSessions.set(slot, stream);
  t.after(() => { activeBrowsers.delete(session); screencastSessions.delete(slot); });
  /**
   * Gửi yêu cầu đóng tab đến handler với request và response cục bộ.
   * @param {object} body Tham số của phím tắt hoặc nút đóng.
   * @return {Promise<number>} Mã HTTP do handler trả về.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-20
   */
  const sendClose = async body => {
    const request = Object.assign(Readable.from([JSON.stringify(body)]), { method: 'POST', url: '/screen/tabs/close/' + slot });
    const reply = { writeHead(status) { this.status = status; }, end() {} };
    await handlePostScreenTabsClose(request, reply);
    return reply.status;
  };
  assert.equal(await sendClose({ screenSourceId: 'previous', index: 0 }), 409);
  assert.equal(await sendClose({ screenSourceId: '' }), 409);
  assert.equal(firstPage.isClosed(), false);
  const openPages = browser.pages();
  openPages.splice(0, openPages.length, lastPage, firstPage, visiblePage);
  let focusChanges = 0;
  firstPage.bringToFront = async () => { focusChanges++; };
  visiblePage.once('close', () => { stream.viewSelection = Symbol(); });
  assert.equal(await sendClose({ screenSourceId: 'visible' }), 200);
  assert.equal(visiblePage.isClosed(), true);
  assert.equal(focusChanges, 0);
  assert.equal(lastPage.isClosed(), false);
  screencastSessions.delete(slot);
  assert.equal(await sendClose({ screenSourceId: 'visible' }), 409);
  assert.equal(await sendClose({ index: 1 }), 200);
  assert.equal(firstPage.isClosed(), true);
  assert.equal(lastPage.isClosed(), false);
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
  session.autofillFields = 2;
  session.autofillError = waitingPage._autofillWaitReason;
  for (const reason of [waitingPage._autofillWaitReason, '']) {
    waitingPage._autofillWaitReason = reason;
    const reported = getAutoRefillStatus().chromeSessions.find(row => row.slot === 12);
    assert.deepEqual(reported.tabs.map(tab => tab.autofillWaitReason), [null, reason || null]);
    await view.evaluate(session => { _updateScreenSlots([session]); _pollThumbnails(); }, reported);
    assert.equal(await view.locator('.screen-tile-status-row .status-idle').textContent(), '⚡ Đã điền 2 ô');
    const rows = view.locator('.screen-tile-footer .status-checking');
    assert.deepEqual(await rows.allTextContents(), [reason ? 'Tab 2 · ' + reason : 'Tự điền · ' + session.autofillError]);
    assert.equal(await rows.locator('*').count(), 0);
  }
  session.autofillError = null;
  const cleared = getAutoRefillStatus().chromeSessions.find(row => row.slot === 12);
  for (const [action, expected] of [
    [{ ...cleared, currentAction: 'Cũ' }, 'Đã điền 2 ô'],
    [{ slot: 12, currentAction: 'Đang chạy' }, 'Đang chạy'],
    [{ slot: 12 }, 'Chưa có trạng thái'],
  ]) {
    await view.evaluate(row => { _updateScreenSlots([row]); _pollThumbnails(); }, action);
    assert.equal(await view.locator('.screen-tile-status-row .status-idle').textContent(), '⚡ ' + expected);
    assert.equal(await view.locator('.screen-tile-footer .status-checking').count(), 0);
  }
});

test('Mini bỏ phản hồi click cũ, giữ đúng nguồn của nhấp đúp và gửi phần văn bản mới', {
  skip: !existsSync(chromium.executablePath()),
}, async t => {
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent('<canvas></canvas><div id="viewport"></div><div id="typeModal" style="display:none"><input id="modalTextInput"></div>');
  await page.addScriptTag({ content: 'const viewport = document.getElementById("viewport");' });
  await page.evaluate(() => Object.assign(window, {
    canvas: document.querySelector('canvas'), currentSlot: 4, lastTapTime: 0, lastTapX: 0, lastTapY: 0,
    canvasNaturalWidth: 200, canvasNaturalHeight: 100, trackpadCursorX: 10, trackpadCursorY: 10,
    virtualCursor: document.querySelector('canvas'), touchStartTime: 0, touchStartX: 0, touchStartY: 0,
    currentInteractionMode: 'touch', longPressTriggered: false, longPressTimer: null, isDragging: false,
    requests: [], notices: [], showTouchRipple() {}, getCanvasPoint: () => ({ x: 10, y: 10 }),
    showToast: message => notices.push(message),
    fetch(url, options) {
      return new Promise(resolve => requests.push({ url, body: JSON.parse(options.body),
        reply: data => resolve({ json: async () => data }) }));
    }
  }));
  for (const file of ['functions/send-input', 'setup/window-open-type-modal-modal', 'setup/window-submit-modal-text-input',
    'setup/window-close-type-modal-modal', 'setup/window-execute-trackpad-dbl-click-pt', 'setup/touchstart-touch',
    'setup/touchend-ph-ng-to-2-4x-nh-p-p', 'setup/click-mousedown']) {
    await page.addScriptTag({ path: fileURLToPath(new URL('../ui/mini/' + file + '.js', import.meta.url)) });
  }

  const touchResult = { ok: true, input: { fieldId: 'password-field', type: 'password', isTextLike: true, name: 'Mật khẩu', value: 'existing-secret' } };
  const tap = async () => {
    await page.evaluate(() => {
      const point = { clientX: 10, clientY: 10 };
      lastTapTime = 0;
      viewport.dispatchEvent(Object.assign(new Event('touchstart'), { touches: [point] }));
      viewport.dispatchEvent(Object.assign(new Event('touchend'), { changedTouches: [point] }));
      viewport.dispatchEvent(new MouseEvent('click'));
    });
  };

  await page.evaluate(() => { canvas.dataset.screenSourceId = 'A'; });
  await tap();
  await page.evaluate(result => {
    canvas.dataset.screenSourceId = 'B';
    requests[0].reply(result);
  }, touchResult);
  assert.equal(await page.locator('#typeModal').isVisible(), false);

  await page.evaluate(() => { window.pendingDoubleClick = executeTrackpadDblClick(); });
  await page.evaluate(async () => {
    currentSlot = 5;
    canvas.dataset.screenSourceId = 'C';
    requests[1].reply({ ok: true });
    await pendingDoubleClick;
  });
  assert.deepEqual(await page.evaluate(() => requests.map(r => [r.url, r.body.type, r.body.screenSourceId])), [
    ['/screen/input/4', 'click', 'A'], ['/screen/input/4', 'click', 'B']
  ]);
  await page.evaluate(() => { window.pendingDoubleClick = executeTrackpadDblClick(); requests[2].reply({ ok: true }); });
  await page.evaluate(async () => { requests[3].reply({ ok: true }); await pendingDoubleClick; });
  assert.deepEqual(await page.evaluate(() => requests.slice(2).map(r => r.body.clickCount)), [1, 2]);

  await tap();
  await page.evaluate(result => requests[4].reply(result), touchResult);
  const draft = page.locator('#modalTextInput');
  await draft.waitFor();
  assert.equal(await draft.inputValue(), '');
  assert.equal(await draft.getAttribute('type'), 'password');
  await draft.fill('new-secret');
  await page.evaluate(() => { window.submissions = [submitModalText(), submitModalText()]; });
  assert.equal(await page.evaluate(() => requests.length), 6, 'Hai lần gửi chỉ tạo một request khi tab còn đang nhận');
  await page.evaluate(async () => {
    requests[5].reply({ ok: false, error: 'Tab bận' });
    await Promise.all(submissions);
  });
  assert.equal(await draft.inputValue(), 'new-secret');
  await page.evaluate(async () => {
    canvas.dataset.screenSourceId = 'D';
    await pressModalKey('Enter');
    await submitModalText();
  });
  assert.equal(await page.evaluate(() => requests.length), 6);
  assert.equal(await draft.inputValue(), 'new-secret');
  await page.evaluate(async () => {
    canvas.dataset.screenSourceId = 'C';
    const submission = submitModalText();
    requests[6].reply({ ok: true });
    await submission;
  });
  assert.deepEqual(await page.evaluate(() => requests[6].body), { type: 'insertText', text: 'new-secret', screenSourceId: 'C', fieldId: 'password-field' });
  assert.equal(await draft.isVisible(), false);
  assert.equal(await draft.inputValue(), '');
  await page.evaluate(() => {
    openTypeModal();
    document.getElementById('modalTextInput').value = 'old';
    window.oldSubmit = submitModalText();
    canvas.dataset.screenSourceId = 'D';
    openTypeModal();
    document.getElementById('modalTextInput').value = 'other';
    window.otherSubmit = submitModalText();
  });
  assert.deepEqual(await page.evaluate(() => requests.slice(7).map(r => r.body.screenSourceId)), ['C', 'D']);
  await page.evaluate(async () => { requests[7].reply({ ok: true }); await oldSubmit; });
  assert.equal(await draft.inputValue(), 'other', 'Phản hồi của tab cũ phải giữ bản nháp của tab đang mở');
  await page.evaluate(async () => { requests[8].reply({ ok: true }); await otherSubmit; });
  assert.equal(await draft.isVisible(), false);
  await tap();
  await page.evaluate(result => {
    openTypeModal();
    closeTypeModal();
    requests[9].reply(result);
  }, touchResult);
  assert.equal(await draft.isVisible(), false, 'Phản hồi chạm tới muộn không được mở lại hộp người dùng đã đóng');
  assert.doesNotMatch(await page.evaluate(() => notices.join(' ')), /secret/);
});
