import { selectUniqueOfferUrls } from '../tabs/select-unique-offer-urls.mjs';
import { configurePageMousePolicy } from '../../autofill/interaction/configure-page-mouse-policy.mjs';
import { takeNextRecord } from '../../records/actions/take-next-record.mjs';
import { navigationTimeout } from '../../runtime/constants/navigation-timeout.mjs';
import { verifyOffer2615Landing } from '../../autofill/offers/2615/verify-offer-landing.mjs';

/**
 * Mở đủ URL offer duy nhất trong Orbita, gán record/chuột và giữ mainPage trước khi điều hướng.
 * @param {object} session Phiên đã gắn giới hạn và bộ lọc tab.
 * @param {string[]} offerUrls Danh sách link người dùng chọn.
 * @param {object[]} records Pool record dùng chung giữa các tab.
 * @return {Promise<void>} Các tab đã được mở hoặc ghi lỗi điều hướng.
 * @throws {Error} Khi context đã đóng hoặc không tạo được tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
export async function openGoLoginOfferTabs(session, offerUrls, records) {
  const urls = selectUniqueOfferUrls(offerUrls, session.websiteUrl);
  const context = session.browser;
  for (let index = 0; index < urls.length; index++) {
    if (session.isClosed) break;
    session._uxOpeningOriginTabs = (session._uxOpeningOriginTabs || 0) + 1;
    let page;
    try { page = index === 0 ? session.mainPage : await context.newPage(); }
    finally { session._uxOpeningOriginTabs--; }
    page._uxOriginTab = true;
    page._uxPlanned = true;
    page._tabIndex = index;
    page._offerNumber = session.offerNumber;
    page._assignedRecord = takeNextRecord(records);
    await session.prepareDevicePage?.(page);
    configurePageMousePolicy(page, session);
    if (index === 0) session.currentRecord = page._assignedRecord;
    await page.goto(urls[index], { waitUntil: 'domcontentloaded', timeout: navigationTimeout })
      .catch(() => session.addBrowserLog?.({ type: 'offer_navigation_failed', detail: 'Không tải được tab offer GoLogin.' }, page));
    if (index === 0) {
      const isInvalid2615Landing = await verifyOffer2615Landing(page, session);
      if (isInvalid2615Landing) return;
    }
  }
}
