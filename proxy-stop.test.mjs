import assert from 'node:assert/strict';
import test from 'node:test';
import { autoRefill, closeActiveBrowsers, queueAutomaticRefill, getDeadOrBlockedReason, watchTrafficBlockedPage } from './app.mjs';

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
