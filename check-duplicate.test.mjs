import assert from 'node:assert/strict';
import test from 'node:test';
import {
  safeNormalizeUrl,
  verifyBrowserExitIp,
  activeExitIpLocks,
  isExitIpCurrentlyInUse,
  releaseProxyLock,
} from './app.mjs';

function createMockBrowser(ipToReturn = '123.45.67.89') {
  return {
    newPage: async () => ({
      goto: async () => ({
        status: () => 200,
        ok: () => true,
      }),
      evaluate: async () => JSON.stringify({ ip: ipToReturn }),
      locator: () => ({
        innerText: async () => ipToReturn,
      }),
      close: async () => {},
    }),
  };
}

test('safeNormalizeUrl correctly handles various URLs without throwing', () => {
  assert.equal(safeNormalizeUrl(''), '');
  assert.equal(safeNormalizeUrl(null), '');
  assert.equal(safeNormalizeUrl('example.com'), 'https://example.com/');
  assert.equal(safeNormalizeUrl('https://example.com/click?offer=1'), 'https://example.com/click?offer=1');
  assert.equal(safeNormalizeUrl('http://invalidscheme::$$'), 'http://invalidscheme::$$');
});

test('verifyBrowserExitIp blocks duplicate IP for same offer when checkDuplicate is true', async () => {
  activeExitIpLocks.clear();
  const testIp = '123.45.67.89';
  const offerUrl = 'https://toffers.top/click?id=100';
  const normUrl = safeNormalizeUrl(offerUrl);
  const usedExitIps = new Set();
  const onExitIp = async () => {};

  const browser = createMockBrowser(testIp);

  // Lần đầu mở: thành công
  const exitIp1 = await verifyBrowserExitIp(browser, usedExitIps, onExitIp, offerUrl, true);
  assert.equal(exitIp1, testIp);
  assert.ok(usedExitIps.has(`${testIp}::${normUrl}`), 'IP must be recorded in usedExitIps with offer URL');
  assert.ok(activeExitIpLocks.has(testIp), 'IP must be locked while running');

  // Giải phóng khóa đồng thời (mô phỏng phiên trước đã đóng)
  releaseProxyLock(null, testIp);
  assert.equal(activeExitIpLocks.has(testIp), false);

  // Lần thứ hai mở cùng IP cho cùng offer URL: phải bị ném lỗi do checkDuplicate = true
  await assert.rejects(
    async () => {
      await verifyBrowserExitIp(browser, usedExitIps, onExitIp, offerUrl, true);
    },
    (err) => {
      assert.match(err.message, /đã được dùng trước đây cho trang đích này/);
      return true;
    },
    'Should reject duplicate IP when checkDuplicate is true'
  );

  // Kiểm tra không bị phantom lock: khi bị reject vì trùng lịch sử, activeExitIpLocks KHÔNG được chứa testIp
  assert.equal(activeExitIpLocks.has(testIp), false, 'Must not hold phantom lock in activeExitIpLocks on duplicate rejection');
});

test('verifyBrowserExitIp allows duplicate IP for same offer when checkDuplicate is false', async () => {
  activeExitIpLocks.clear();
  const testIp = '98.76.54.32';
  const offerUrl = 'https://toffers.top/click?id=200';
  const normUrl = safeNormalizeUrl(offerUrl);
  // Đã từng chạy IP này cho offer này trong lịch sử
  const usedExitIps = new Set([`${testIp}::${normUrl}`]);
  const onExitIp = async () => {};

  const browser = createMockBrowser(testIp);

  // Khi checkDuplicate = false, phải cho phép dùng lại IP
  const exitIp = await verifyBrowserExitIp(browser, usedExitIps, onExitIp, offerUrl, false);
  assert.equal(exitIp, testIp, 'Should allow reusing IP when checkDuplicate is false');

  // Giải phóng khóa
  releaseProxyLock(null, testIp);
});

test('verifyBrowserExitIp always blocks concurrent same-IP conflict even if checkDuplicate is false', async () => {
  activeExitIpLocks.clear();
  const testIp = '11.22.33.44';
  const offerUrl = 'https://toffers.top/click?id=300';
  const usedExitIps = new Set();
  const onExitIp = async () => {};

  // Giả lập một cửa sổ khác đang chạy cùng IP này
  activeExitIpLocks.add(testIp);

  const browser = createMockBrowser(testIp);

  // Dù checkDuplicate = false, xung đột đồng thời vẫn bị chặn tuyệt đối
  await assert.rejects(
    async () => {
      await verifyBrowserExitIp(browser, usedExitIps, onExitIp, offerUrl, false);
    },
    (err) => {
      assert.match(err.message, /đang được sử dụng ở một cửa sổ khác/);
      return true;
    },
    'Must always reject concurrent IP conflict regardless of checkDuplicate setting'
  );

  // Dọn dẹp
  activeExitIpLocks.clear();
});

test('hideUntilLead mode keeps browser hidden until force=true on confirmed lead', async () => {
  let cdpSent = [];
  const fakeCdpSession = {
    send: async (method, params) => {
      cdpSent.push({ method, params });
      if (method === 'Browser.getWindowForTarget') return { windowId: 101 };
      return {};
    },
  };

  const fakePage = {
    isClosed: () => false,
    bringToFront: async () => {},
  };

  const session = {
    hideUntilLead: true,
    hideUntilTarget: false,
    hasShownWindow: false,
    mainPage: fakePage,
  };

  const tile = { left: 100, top: 100, width: 600, height: 800 };
  let cdpSession = fakeCdpSession;
  let cdpWindowId = 101;

  session.showWindow = async (force = false) => {
    if ((!session.hideUntilTarget && !session.hideUntilLead) || session.hasShownWindow) return;
    if (session.hideUntilLead && !force) return;
    session.hasShownWindow = true;
    await cdpSession.send('Browser.setWindowBounds', {
      windowId: cdpWindowId,
      bounds: {
        left: tile.left,
        top: tile.top,
        width: tile.width,
        height: tile.height,
        windowState: 'normal',
      },
    });
  };

  // 1. Khi load trang đích hoặc field filled, showWindow() gọi với force=false mặc định
  await session.showWindow();
  assert.equal(session.hasShownWindow, false, 'Window must NOT be shown before lead is confirmed');
  assert.equal(cdpSent.length, 0, 'No setWindowBounds should be sent yet');

  // 2. Khi lead confirmed, showWindow(true) được gọi
  await session.showWindow(true);
  assert.equal(session.hasShownWindow, true, 'Window MUST be shown once lead is confirmed');
  assert.equal(cdpSent.length, 1);
  assert.equal(cdpSent[0].params.bounds.windowState, 'normal');
  assert.equal(cdpSent[0].params.bounds.left, 100);
});
