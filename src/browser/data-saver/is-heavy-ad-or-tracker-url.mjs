import { HEAVY_AD_AND_TRACKER_HOSTS } from './state/heavy-ad-and-tracker-hosts.mjs';
import { isEssentialOfferUrl } from './is-essential-offer-url.mjs';

/**
 * Kiểm tra xem URL có thuộc danh sách mạng quảng cáo video/tracker nặng không.
 *
 * @param {string} url
 * @return {boolean} True nếu URL thuộc nhóm tài nguyên tương ứng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function isHeavyAdOrTrackerUrl(url) {
  if (!url || isEssentialOfferUrl(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return HEAVY_AD_AND_TRACKER_HOSTS.some(badHost => host === badHost || host.endsWith('.' + badHost));
  } catch {
    return false;
  }
}
export { isHeavyAdOrTrackerUrl };
