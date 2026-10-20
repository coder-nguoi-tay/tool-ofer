import assert from 'node:assert/strict';
import test from 'node:test';
import { autoRefill, closeActiveBrowsers, closeChromeWhenLastTabCloses, queueAutomaticRefill, getDeadOrBlockedReason, watchTrafficBlockedPage, proxyQueue, clearAllProxyQueue } from './app.mjs';

test('đóng tab cuối AdsPower vẫn giữ cửa sổ mở bằng tab trống', async () => {
  let onPageClose;
  let browserCloseCount = 0;
  let replacementPageCount = 0;
  const page = { isClosed: () => true, on: (event, handler) => { if (event === 'close') onPageClose = handler; } };
  const session = {
    isManagedProfile: true,
    suppressAutoRefill: false,
    chromeVersion: 'AdsPower SunBrowser 155.0.8059.40',
    browser: {
      on: () => {},
      pages: () => [page],
      close: async () => { browserCloseCount += 1; },
      newPage: async () => { replacementPageCount += 1; return { isClosed: () => false, on: () => {} }; },
    },
  };
  autoRefill.sequential = false;
  autoRefill.targetCount = 2;
  closeChromeWhenLastTabCloses(session);
  await onPageClose();
  assert.equal(autoRefill.targetCount, 2);
  assert.equal(session.suppressAutoRefill, false);
  assert.equal(browserCloseCount, 0);
  assert.equal(replacementPageCount, 1);
});

test('đóng tab cuối Chrome thường không tự đóng phiên khi autoRefill đang bật', async () => {
  let onPageClose;
  let browserCloseCount = 0;
  let replacementPageCount = 0;
  const page = { isClosed: () => true, on: (event, handler) => { if (event === 'close') onPageClose = handler; } };
  const session = {
    isManagedProfile: false,
    suppressAutoRefill: false,
    chromeVersion: 'Chrome 120.0.6099.109',
    browser: {
      on: () => {},
      pages: () => [page],
      close: async () => { browserCloseCount += 1; },
      newPage: async () => { replacementPageCount += 1; return { isClosed: () => false, on: () => {} }; },
    },
  };
  autoRefill.enabled = true;
  autoRefill.stopRequested = false;
  autoRefill.sequential = false;
  autoRefill.targetCount = 2;
  closeChromeWhenLastTabCloses(session);
  await onPageClose();
  assert.equal(autoRefill.targetCount, 2);
  assert.equal(session.suppressAutoRefill, false);
  assert.equal(browserCloseCount, 0);
  assert.equal(replacementPageCount, 1);
});

test('closeActiveBrowsers sets stopRequested and disables autoRefill completely', async () => {
  autoRefill.enabled = true;
  autoRefill.stopRequested = false;
  autoRefill.settings = { websiteUrl: 'https://example.com' };
  autoRefill.targetCount = 3;

  const result = await closeActiveBrowsers();

  assert.equal(autoRefill.stopRequested, true, 'stopRequested must be true');
  assert.equal(autoRefill.enabled, false, 'enabled must be false');
  assert.equal(autoRefill.settings, null, 'settings must be cleared');
  assert.equal(autoRefill.targetCount, 0, 'targetCount must be reset to 0');
  assert.equal(result.autoRefillEnabled, false, 'result must report autoRefillEnabled = false');
});

test('queueAutomaticRefill does not schedule refill when stopRequested is true', () => {
  autoRefill.stopRequested = true;
  autoRefill.enabled = true;
  autoRefill.settings = { websiteUrl: 'https://example.com' };
  autoRefill.queued = false;

  queueAutomaticRefill();
  assert.equal(autoRefill.queued, false, 'Refill should not be queued if stop was requested');
});

test('getDeadOrBlockedReason correctly detects proxy connection errors', async () => {
  const fakePageProxyError = {
    url: () => 'chrome-error://chromewebdata/',
    mainFrame: () => null,
    frames: () => [],
    evaluate: async (fn) => typeof fn === 'function' ? 'ERR_PROXY_CONNECTION_FAILED' : 'ERR_PROXY_CONNECTION_FAILED',
  };
  const reason1 = await getDeadOrBlockedReason(fakePageProxyError);
  assert.ok(reason1, 'Should detect chrome-error page');

  const fakePageSocksError = {
    url: () => 'about:blank',
    mainFrame: () => null,
    frames: () => [],
    evaluate: async (fn) => {
      // Mock document evaluate
      return 'ERR_SOCKS_CONNECTION_FAILED';
    },
  };
  const reason2 = await getDeadOrBlockedReason(fakePageSocksError);
  assert.equal(reason2, 'ERR_SOCKS_CONNECTION_FAILED');

  const fakeOfferPage = {
    url: () => 'https://adswapper.g2afse.com/disabled.html',
    mainFrame: () => null,
    frames: () => [],
    evaluate: async () => null,
  };
  const reasonOffer = await getDeadOrBlockedReason(fakeOfferPage);
  assert.equal(reasonOffer, null, 'Should not kill browser on offer or tracking redirect pages');
});

test('watchTrafficBlockedPage does not re-enable autoRefill if stopRequested is true', async () => {
  autoRefill.stopRequested = true;
  autoRefill.enabled = false;
  autoRefill.settings = null;

  let closedCount = 0;
  const fakePage = {
    isClosed: () => false,
    url: () => 'chrome-error://chromewebdata/',
    close: async () => { closedCount++; },
  };
  const fakeSession = {
    mainPage: fakePage,
    browser: {
      pages: async () => [fakePage],
      isClosed: () => false,
      close: async () => { closedCount++; },
    },
    closingDueToTrafficBlocked: false,
    suppressAutoRefill: false,
    proxyKey: null,
  };

  watchTrafficBlockedPage(fakeSession);

  // Wait 1.2s for the 1000ms watcher interval to fire
  await new Promise(r => setTimeout(r, 1200));

  assert.equal(autoRefill.stopRequested, true, 'stopRequested must stay true');
  assert.equal(autoRefill.enabled, false, 'enabled must stay false');
  assert.equal(fakeSession.suppressAutoRefill, true, 'suppressAutoRefill must be set to true');
});

test('clearAllProxyQueue completely empties available and used queues and resets state', async () => {
  proxyQueue.available = ['1.1.1.1:8080', '2.2.2.2:8080'];
  proxyQueue.used = ['3.3.3.3:8080'];

  const result = await clearAllProxyQueue();

  assert.equal(result.success, true);
  assert.equal(result.count, 3);
  assert.equal(result.available, 0);
  assert.equal(result.used, 0);
  assert.equal(proxyQueue.available.length, 0);
  assert.equal(proxyQueue.used.length, 0);
  assert.match(result.message, /Đã xóa hết tất cả 3 proxy/);
});
