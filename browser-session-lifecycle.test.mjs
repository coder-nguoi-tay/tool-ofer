import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { closeBrowserBySlot, closeChromeWhenLastTabCloses } from './app.mjs';

/** Mock a browser page for lifecycle behavior tests. */
class MockBrowserPage extends EventEmitter {
  /** @return {void} Initialize one open page. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  constructor() {
    super();
    this.closed = false;
  }

  /** @return {boolean} Whether the page has closed. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  isClosed() {
    return this.closed;
  }
}

/** Mock the page lifecycle methods used by closeChromeWhenLastTabCloses. */
class MockBrowser extends EventEmitter {
  /** @return {void} Initialize an open browser. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  constructor() {
    super();
    this.openPages = [];
    this.newPageCalls = 0;
    this.failToOpenPage = false;
  }

  /** @return {MockBrowserPage[]} The currently open pages. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  pages() {
    return this.openPages.filter((page) => !page.isClosed());
  }

  /** @return {MockBrowserPage} A new page registered with the browser. @throws {Error} When page creation is disabled. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  async newPage() {
    this.newPageCalls += 1;
    if (this.failToOpenPage) throw new Error('Browser disconnected');
    const page = new MockBrowserPage();
    this.openPages.push(page);
    this.emit('page', page);
    return page;
  }

  /** @return {MockBrowserPage} An initial page registered with the browser. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  addPage() {
    const page = new MockBrowserPage();
    this.openPages.push(page);
    return page;
  }
}

/** Close a mocked page and await its close callback. @param {MockBrowser} browser Browser mock. @param {MockBrowserPage} page Page mock. @return {Promise<void>} Completion of page close handling. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
async function closeMockPage(browser, page) {
  page.closed = true;
  browser.openPages = browser.openPages.filter((openPage) => openPage !== page);
  for (const listener of page.listeners('close')) await listener();
}

/** Build a session object matching the lifecycle helper's required contract. @param {MockBrowser} browser Browser mock. @return {object} Session with a log collector. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
function createMockSession(browser) {
  return {
    browser,
    logs: [],
    addBrowserLog(entry) {
      this.logs.push(entry);
    },
  };
}

test('keeps the browser open when a non-final tab closes and recovers after the final tab closes', async () => {
  const browser = new MockBrowser();
  const firstPage = browser.addPage();
  const lastPage = browser.addPage();
  const session = createMockSession(browser);
  closeChromeWhenLastTabCloses(session);

  await closeMockPage(browser, firstPage);
  assert.equal(browser.newPageCalls, 0, 'Closing one of several tabs should not create a replacement');

  await closeMockPage(browser, lastPage);
  assert.equal(browser.newPageCalls, 1, 'Closing the final tab should create a replacement page');
  assert.equal(session.logs[0]?.type, 'tab_recovered');

  const recoveredPage = browser.pages()[0];
  await closeMockPage(browser, recoveredPage);
  assert.equal(browser.newPageCalls, 2, 'A replacement tab must also be watched for later closures');
});

test('does not reopen a tab during intentional shutdown or network failure handling', async (t) => {
  const stopCases = [
    ['manually suppressed session', { suppressAutoRefill: true }],
    ['traffic-blocked session', { closingDueToTrafficBlocked: true }],
    ['no-lead session', { closingDueToNoLead: true }],
    ['failed lead session', { leadCheckStatus: 'failed' }],
  ];

  for (const [caseName, sessionState] of stopCases) {
    await t.test(caseName, async () => {
      const browser = new MockBrowser();
      const page = browser.addPage();
      const session = Object.assign(createMockSession(browser), sessionState);
      closeChromeWhenLastTabCloses(session);
      await closeMockPage(browser, page);
      assert.equal(browser.newPageCalls, 0);
    });
  }

  await t.test('browser disconnection while recovering', async () => {
    const browser = new MockBrowser();
    const page = browser.addPage();
    browser.failToOpenPage = true;
    const session = createMockSession(browser);
    closeChromeWhenLastTabCloses(session);
    await assert.doesNotReject(closeMockPage(browser, page));
    assert.equal(browser.newPageCalls, 1);
    assert.equal(session.logs.length, 0);
  });
});

test('closes only the requested browser slot without scheduling a replacement', async () => {
  let requestedCloseCount = 0;
  let otherCloseCount = 0;
  const requestedSession = {
    slot: 2,
    browser: { close: async () => { requestedCloseCount += 1; } },
    _monitorInterval: setInterval(() => {}, 60_000),
    _autofillTimer: setInterval(() => {}, 60_000),
  };
  const otherSession = {
    slot: 1,
    browser: { close: async () => { otherCloseCount += 1; } },
  };

  const result = await closeBrowserBySlot(2, new Set([otherSession, requestedSession]));

  assert.deepEqual(result, { success: true, slot: 2 });
  assert.equal(requestedCloseCount, 1);
  assert.equal(otherCloseCount, 0);
  assert.equal(requestedSession.suppressAutoRefill, true);
  assert.equal(requestedSession.isClosed, true);
  assert.equal(requestedSession._monitorInterval, null);
  assert.equal(requestedSession._autofillTimer, null);
});

test('does not change other sessions when the requested slot is missing or close fails', async () => {
  const untouchedSession = {
    slot: 1,
    browser: { close: async () => {} },
  };
  await assert.rejects(closeBrowserBySlot(2, new Set([untouchedSession])), /Không tìm thấy trình duyệt/);
  assert.equal(untouchedSession.suppressAutoRefill, undefined);

  const failedSession = {
    slot: 2,
    browser: { close: async () => { throw new Error('close failed'); } },
  };
  await assert.rejects(closeBrowserBySlot(2, new Set([failedSession])), /close failed/);
  assert.equal(failedSession.suppressAutoRefill, false);
  assert.equal(failedSession.isClosed, undefined);
});
