import { normalizeOfferUrl } from './normalize-offer-url.mjs';
import { MAX_OFFER_TABS } from '../../runtime/constants/max-offer-tabs.mjs';

/**
 * Chọn link khởi đầu duy nhất; số luồng không được nhân bản cùng URL trong một trình duyệt.
 * @param {string[]} offerUrls Các link người dùng cấu hình.
 * @param {string} websiteUrl Link mặc định nếu không cấu hình danh sách.
 * @return {string[]} Link duy nhất theo thứ tự, không vượt trần tab offer.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function selectUniqueOfferUrls(offerUrls, websiteUrl) {
  const links = offerUrls?.length ? offerUrls : [websiteUrl];
  return [...new Set(links.map(url => normalizeOfferUrl(url)).filter(Boolean))].slice(0, MAX_OFFER_TABS);
}
