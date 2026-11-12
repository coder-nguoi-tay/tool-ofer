import { installExcludedPopupFilter } from './install-excluded-popup-filter.mjs';
import { closeExcludedOfferTab } from './close-excluded-offer-tab.mjs';
import { isExcludedOfferPageUrl } from './is-excluded-offer-page-url.mjs';
import { normalizeOfferUrl } from './normalize-offer-url.mjs';
import { getOfferUrlState } from './get-offer-url-state.mjs';
import { hasUnfinishedOfferWork } from '../../leads/actions/has-unfinished-offer-work.mjs';

const attached = new WeakSet();

/**
 * Dọn tab trùng khi mở/điều hướng, kể cả tab gốc và IP có lead; giữ tab đang làm câu hỏi.
 * @param {object} context BrowserContext riêng của phiên.
 * @param {object} session Phiên sở hữu tab chính và callback log.
 * @return {void} Gắn listener một lần, không đóng browser hoặc tab cuối.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function attachUniqueOfferTabs(context, session) {
  if (attached.has(context)) return;
  attached.add(context);
  void installExcludedPopupFilter(context).catch(() => {});
  const state = getOfferUrlState(context);
  const watched = new WeakSet();
  const visited = new WeakSet();
  let queue = Promise.resolve();
  /**
   * Chốt chủ sở hữu link trước khi đọc DOM và chỉ loại tab trùng còn có tab khác giữ phiên.
   * @param {object} page Tab vừa mở/điều hướng.
   * @return {Promise<void>} Giữ tab làm việc hoặc đóng đúng một bản trùng.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const check = async page => {
    if (session.isClosed || page.isClosed()) return;
    if (await closeExcludedOfferTab(context, session, page)) return;
    const key = normalizeOfferUrl(page.url());
    if (!key) return;
    const previous = state.owners.get(key);
    const isNewTab = !visited.has(page);
    visited.add(page);
    state.opened.add(key);
    if (!previous || previous === page) { state.owners.set(key, page); return; }
    const sameLink = !previous.isClosed() && normalizeOfferUrl(previous.url()) === key;
    if (!sameLink && !isNewTab) { state.owners.set(key, page); return; }
    let keep = previous, duplicate = page;
    if (sameLink && !await hasUnfinishedOfferWork(previous) && await hasUnfinishedOfferWork(page)) { keep = page; duplicate = previous; }
    if (duplicate.isClosed() || !context.pages().some(other => other !== duplicate && !other.isClosed())) return;
    if (sameLink && (normalizeOfferUrl(keep.url()) !== key || normalizeOfferUrl(duplicate.url()) !== key)) return;
    if (session.mainPage === duplicate) session.mainPage = keep.isClosed() ? context.pages().find(other => other !== duplicate && !other.isClosed()) : keep;
    duplicate._uxClosedByApp = 'tab trùng link';
    await duplicate.close().catch(() => {});
    if (sameLink) state.owners.set(key, keep);
    session.addBrowserLog?.({ type: 'duplicate_tab_closed', detail: 'Đóng tab trùng link trong cùng trình duyệt; giữ tab gốc hoặc tab còn form/câu hỏi.' });
  };
  /**
   * Đăng ký kiểm tra nối tiếp để popup đồng thời không cùng nhận quyền giữ một link.
   * @param {object} page Tab cần theo dõi.
   * @return {void} Gắn listener điều hướng main frame và kiểm tra URL hiện tại.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const watch = page => {
    if (watched.has(page)) return;
    watched.add(page);
    const schedule = () => {
      if (!page.isClosed() && isExcludedOfferPageUrl(page.url())) { void closeExcludedOfferTab(context, session, page).catch(() => {}); return; }
      queue = queue.then(() => check(page)).catch(() => {});
    };
    page.on('framenavigated', frame => { if (frame === page.mainFrame()) schedule(); });
    page.on('domcontentloaded', schedule);
    schedule();
  };
  /**
   * Xét chuỗi redirect ở cấp context để bắt cả request đầu của popup trước sự kiện page.
   * @param {object} request Request điều hướng do Playwright phát ra.
   * @return {void} Đóng đúng tab bị loại trừ, bỏ qua request iframe/tài nguyên nền.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const checkNavigation = request => {
    try {
      if (!request.isNavigationRequest()) return;
      const frame = request.frame();
      const page = frame.page();
      if (frame !== page.mainFrame()) return;
      for (let navigation = request; navigation; navigation = navigation.redirectedFrom()) {
        if (isExcludedOfferPageUrl(navigation.url())) { void closeExcludedOfferTab(context, session, page, navigation.url()).catch(() => {}); return; }
      }
    } catch {}
  };
  context.on('request', checkNavigation);
  context.on('response', response => checkNavigation(response.request()));
  context.on('page', watch);
  context.pages().forEach(watch);
}
