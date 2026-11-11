import { getProxyUniqueKey } from './get-proxy-unique-key.mjs';
import { multiOfferState } from '../../runtime/constants/multi-offer-state.mjs';

/**
 * Kiểm tra xem một proxy đã được hoàn tất bởi TẤT CẢ các offer đang cấu hình chưa.
 *
 * @param {object} proxy Đối tượng proxy.
 * @param {number} offerCount Tổng số offer.
 * @return {boolean} True nếu tất cả offer đều đã dùng proxy này.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function isProxyUsedByAllOffers(proxy, offerCount = 1) {
  if (!proxy) return false;
  const pKey = getProxyUniqueKey(proxy);
  if (!pKey) return false;
  const count = Math.max(1, offerCount);
  for (let k = 1; k <= count; k++) {
    const usedSet = multiOfferState.offerUsed.get(k);
    if (!usedSet || !usedSet.has(pKey)) {
      return false;
    }
  }
  return true;
}
