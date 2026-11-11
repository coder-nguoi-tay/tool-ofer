import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { closeChromeWhenLastTabCloses, findDuplicateTabs } from "../app.mjs";

test('findDuplicateTabs: đóng tab trùng link, không bao giờ đóng tab gốc', () => {
  const tab = (url, origin = false) => ({ url: () => url, isClosed: () => false, origin });
  const originA = tab('https://offer.test/a', true);
  const originA2 = tab('https://offer.test/a', true); // đa tab cố ý mở cùng link
  const popupA = tab('https://offer.test/a#step2');
  const popupB = tab('https://offer.test/b');
  const popupB2 = tab('https://offer.test/b');
  const blank = tab('about:blank');
  const blank2 = tab('about:blank');
  const dups = findDuplicateTabs([originA, originA2, popupA, popupB, popupB2, blank, blank2], (p) => p.origin);
  assert.deepEqual(dups, [popupA, popupB2]);
});

/** Mock một tab Chrome cho kiểm thử vòng đời trình duyệt. */
class MockBrowserPage extends EventEmitter {
  /** @return {void} Khởi tạo một tab đang mở. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  constructor() {
    super();
    this.closed = false;
  }

  /** @return {boolean} True khi tab đã đóng. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  isClosed() {
    return this.closed;
  }
}

/** Mock các phương thức vòng đời trình duyệt mà `closeChromeWhenLastTabCloses` dùng. */
class MockBrowser extends EventEmitter {
  /** @return {void} Khởi tạo trình duyệt đang mở và đếm số lần mở tab thay thế. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  constructor() {
    super();
    this.openPages = [];
    this.newPageCalls = 0;
    this.failToOpenPage = false;
    this.closeCalls = 0;
  }

  /** @return {MockBrowserPage[]} Các tab đang mở. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  pages() {
    return this.openPages.filter((page) => !page.isClosed());
  }

  /** @return {MockBrowserPage} Một tab mới được đăng ký với trình duyệt. @throws {Error} Khi mô phỏng trình duyệt mất kết nối. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  async newPage() {
    this.newPageCalls += 1;
    if (this.failToOpenPage) throw new Error('Browser disconnected');
    const page = new MockBrowserPage();
    this.openPages.push(page);
    this.emit('page', page);
    return page;
  }

  /** @return {MockBrowserPage} Một tab đăng ký thủ công mà không phát sự kiện 'page'. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  addPage() {
    const page = new MockBrowserPage();
    this.openPages.push(page);
    return page;
  }

  /** @return {Promise<void>} Ghi nhận một lần gọi đóng trình duyệt. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
  async close() {
    this.closeCalls += 1;
  }
}

/** Đóng một tab giả, gỡ khỏi danh sách đang mở và chạy toàn bộ trình xử lý 'close'. @param {MockBrowser} browser Trình duyệt giả. @param {MockBrowserPage} page Tab cần đóng. @return {Promise<void>} Hoàn tất khi mọi trình xử lý đã chạy. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
async function closeMockPage(browser, page) {
  page.closed = true;
  browser.openPages = browser.openPages.filter((openPage) => openPage !== page);
  for (const listener of page.listeners('close')) await listener();
}

/** Xây session khớp hợp đồng mà `closeChromeWhenLastTabCloses` yêu cầu. @param {MockBrowser} browser Trình duyệt giả. @return {object} Session có trình duyệt và bộ ghi log. @author ductv <ductv@getflycrm.com> @since 2026-10-21 */
function createMockSession(browser) {
  return {
    browser,
    logs: [],
    addBrowserLog(entry) {
      this.logs.push(entry);
    },
  };
}

test('keeps other tabs but closes browser when the final tab is closed', async () => {
  const browser = new MockBrowser();
  const firstPage = browser.addPage();
  const lastPage = browser.addPage();
  const session = createMockSession(browser);
  closeChromeWhenLastTabCloses(session);

  await closeMockPage(browser, firstPage);
  assert.equal(browser.newPageCalls, 0, 'Đóng một trong nhiều tab không được mở tab thay thế');
  assert.equal(browser.closeCalls, 0, 'Không được đóng trình duyệt khi vẫn còn tab khác');

  await closeMockPage(browser, lastPage);
  assert.equal(browser.newPageCalls, 0, 'Đóng tab cuối không được mở lại tab trống');
  assert.equal(browser.closeCalls, 1, 'Đóng tab cuối phải đóng phiên trình duyệt');
  assert.equal(session.suppressAutoRefill, true, 'Không tự bù phiên vừa đóng bằng nút X');
  assert.equal(session.logs[0]?.type, 'manual_browser_closed');
});

test('tab cuối đóng khi chạy ngầm hoặc do app đóng: tắt trình duyệt nhưng vẫn bù slot', async (t) => {
  const cases = [
    ['headless', { trueHeadless: true }, null],
    ['cửa sổ đang ẩn', { isWindowVisible: false }, null],
    ['app đóng tab không phải offer', {}, 'tab không phải offer'],
  ];
  for (const [caseName, sessionState, closedByApp] of cases) {
    await t.test(caseName, async () => {
      const browser = new MockBrowser();
      const page = browser.addPage();
      if (closedByApp) page._uxClosedByApp = closedByApp;
      const session = Object.assign(createMockSession(browser), sessionState);
      closeChromeWhenLastTabCloses(session);
      await closeMockPage(browser, page);
      assert.equal(browser.closeCalls, 1, 'Tab cuối đóng phải tắt trình duyệt');
      assert.equal(session.suppressAutoRefill, false, 'Không phải người dùng đóng: vẫn bù slot mới');
      assert.equal(session.logs[0]?.type, 'last_tab_closed_auto');
    });
  }
});

test('does not reopen a tab during intentional shutdown handling', async (t) => {
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
      assert.equal(browser.newPageCalls, 0, `${caseName} không được mở tab thay thế`);
      assert.equal(browser.closeCalls, 0);
    });
  }
});

test('swallows a browser disconnection while closing the final tab', async () => {
  const browser = new MockBrowser();
  const page = browser.addPage();
  const session = createMockSession(browser);
  closeChromeWhenLastTabCloses(session);

  await assert.doesNotReject(closeMockPage(browser, page));
  assert.equal(browser.newPageCalls, 0);
  assert.equal(browser.closeCalls, 1);
});
