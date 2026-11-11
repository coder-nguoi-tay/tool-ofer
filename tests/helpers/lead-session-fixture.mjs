import { EventEmitter } from 'node:events';

/**
 * Tạo tab giả có điều hướng và sự kiện đóng để kiểm tra bảo vệ IP mà không mở browser thật.
 * @param {object} counters Bộ đếm thao tác của phiên giả.
 * @return {EventEmitter} Tab giả dùng trong các test vòng đời lead.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function createLeadTestPage(counters) {
  const page = new EventEmitter();
  page.currentUrl = 'https://offer.test/form';
  page.closed = false;
  page.url = () => page.currentUrl;
  page.isClosed = () => page.closed;
  page.frames = () => [];
  page.mainFrame = () => page;
  page.evaluate = async () => null;
  page.bringToFront = async () => {};
  page.reload = async () => {
    page.currentUrl = page.reloadUrl || page.currentUrl;
    page.emit('framenavigated', page);
  };
  page.close = async () => {
    counters.pageCloses++;
    page.closed = true;
    page.emit('close');
  };
  return page;
}

/**
 * Tạo một trình duyệt giả độc lập với IP, danh sách tab và bộ đếm đóng riêng.
 * @param {string} exitIp IP exit đã xác minh.
 * @param {number} slot Số slot của trình duyệt.
 * @return {object} Phiên, tab, browser và bộ đếm thao tác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function createLeadTestSession(exitIp, slot = 1) {
  const counters = { pageCloses: 0, browserCloses: 0, newPages: 0 };
  const page = createLeadTestPage(counters);
  const browser = new EventEmitter();
  const pages = [page];
  browser.pages = () => pages;
  browser.isClosed = () => counters.browserCloses > 0;
  browser.close = async () => { counters.browserCloses++; browser.emit('close'); };
  browser.newPage = async () => {
    counters.newPages++;
    const replacement = createLeadTestPage(counters);
    pages.push(replacement);
    browser.emit('page', replacement);
    return replacement;
  };
  const session = { browser, mainPage: page, exitIp, slot, tileIndex: slot - 1, chromeVersion: 'Chrome fixture', emailFilled: true };
  return { session, page, browser, counters };
}

/**
 * Lấy callback kiểm tra định kỳ của watcher để test chạy ngay, không phải chờ thời gian thật.
 * @param {object} testContext Context của node:test.
 * @return {Function[]} Các callback interval đã đăng ký trong test.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function captureLeadWatcherTicks(testContext) {
  const ticks = [];
  testContext.mock.method(globalThis, 'setInterval', (callback) => {
    ticks.push(callback);
    return { unref() {} };
  });
  testContext.mock.method(globalThis, 'clearInterval', () => {});
  return ticks;
}
