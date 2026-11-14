import { MAX_OFFER_TABS } from '../../runtime/constants/max-offer-tabs.mjs';
import { closePageBestEffort } from '../../proxy/actions/close-page-best-effort.mjs';

const attached = new WeakSet();
const closing = new WeakSet();

/**
 * Giữ tối đa 10 tab thật trên mỗi BrowserContext, chỉ đóng các tab mới nhất vượt trần.
 * Không quét DOM hoặc phân loại non-offer; trần offerwall vẫn được reserveOfferwallTabSlot giữ.
 * @param {object} context BrowserContext của phiên.
 * @param {object} session Phiên đang chạy, dùng để ghi nhật ký đóng tab.
 * @param {number} maxTabs Trần số tab, mặc định MAX_OFFER_TABS và luôn tối thiểu một tab.
 * @return {void} Gắn một listener cho tab mới và dọn phần vượt trần đã tồn tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export function limitOfferTabs(context, session, maxTabs = MAX_OFFER_TABS) {
  if (attached.has(context)) return;
  attached.add(context);
  const limit = Math.max(1, Math.floor(Number(maxTabs) || MAX_OFFER_TABS));
  const closeExcessTabs = () => {
    const livePages = context.pages().filter(page => !page.isClosed());
    for (const page of livePages.slice(limit)) {
      if (closing.has(page)) continue;
      closing.add(page);
      page._uxClosedByApp = `vượt giới hạn ${limit} tab`;
      session.addBrowserLog?.({
        type: 'tab_limit_closed',
        detail: `Đóng tab vượt giới hạn ${limit} tab trong một trình duyệt; giữ ${limit} tab mở đầu.`
      });
      void closePageBestEffort(page).finally(() => closing.delete(page));
    }
  };
  context.on('page', closeExcessTabs);
  closeExcessTabs();
}
