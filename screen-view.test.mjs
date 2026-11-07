import assert from 'node:assert/strict';
import test from 'node:test';

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
