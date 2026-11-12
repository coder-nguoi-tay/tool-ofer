import { isExcludedOfferPageUrl } from './is-excluded-offer-page-url.mjs';
import { protectConfirmedLeadSession } from '../../leads/actions/protect-confirmed-lead-session.mjs';

const closing = new WeakSet();

/**
 * Đóng riêng tab bị loại trừ, giữ browser có lead bằng tab trống nếu đó là tab cuối.
 * @param {object} context BrowserContext của IP hiện tại.
 * @param {object} session Phiên chứa tab chính và callback log.
 * @param {object} page Tab vừa mở/điều hướng.
 * @param {string} destination URL điều hướng bị loại trừ, mặc định là URL tab hiện tại.
 * @return {Promise<boolean>} True khi URL thuộc danh sách loại trừ và đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function closeExcludedOfferTab(context, session, page, destination = page.url()) {
  if (page.isClosed() || !isExcludedOfferPageUrl(destination)) return false;
  if (closing.has(page)) return true;
  closing.add(page);
  try {
    const others = context.pages().filter(other => other !== page && !other.isClosed());
    if (!others.length && protectConfirmedLeadSession(session)) others.push(await context.newPage());
    if (session.mainPage === page && others.length) session.mainPage = others[0];
    page._uxClosedByApp = 'trang thuộc danh sách loại trừ';
    await page.close();
    session.addBrowserLog?.({ type: 'excluded_tab_closed', detail: 'Đã đóng tab chính sách hoặc offer thuộc danh sách loại trừ; giữ các tab đang làm việc.' });
  } catch (error) {
    session.addBrowserLog?.({ type: 'excluded_tab_close_failed', detail: `Chưa đóng được tab thuộc danh sách loại trừ (${error.name || 'error'}); giữ các tab khác.` });
  } finally { closing.delete(page); }
  return true;
}
