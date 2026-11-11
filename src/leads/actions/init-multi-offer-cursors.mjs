import { multiOfferState } from '../../runtime/constants/multi-offer-state.mjs';

/**
 * Khởi tạo độ lệch phân bổ cho K offer trên M proxy để các luồng tránh nhau tối đa.
 *
 * @param {number} offerCount Tổng số offer đang cấu hình.
 * @param {number} totalProxies Tổng số proxy trong danh sách.
 * @return {void} Kết quả xử lý init multi offer cursors.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function initMultiOfferCursors(offerCount, totalProxies) {
  const M = Math.max(1, totalProxies);
  const count = Math.max(1, offerCount);
  multiOfferState.offerCount = count;
  for (let k = 1; k <= count; k++) {
    if (!multiOfferState.offerUsed.has(k)) {
      multiOfferState.offerUsed.set(k, new Set());
    }
    if (count === 2) {
      multiOfferState.offerCursors.set(k, k === 1 ? 0 : Math.max(0, M - 1));
      multiOfferState.offerDirections.set(k, k === 1 ? 1 : -1);
    } else {
      const offset = Math.floor((k - 1) * M / count) % M;
      multiOfferState.offerCursors.set(k, offset);
      multiOfferState.offerDirections.set(k, 1);
    }
  }
}
