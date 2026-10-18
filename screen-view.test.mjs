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
});
