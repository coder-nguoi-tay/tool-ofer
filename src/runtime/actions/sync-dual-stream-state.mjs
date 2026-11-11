import { dualStreamState } from '../constants/dual-stream-state.mjs';
import { multiOfferState } from '../constants/multi-offer-state.mjs';

/**
 * Đồng bộ giữa multiOfferState và dualStreamState để giữ tính tương thích.
 * @param {number} offerCount offer count.
 * @return {void} Kết quả xử lý sync dual stream state.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function syncDualStreamState(offerCount = 2) {
  dualStreamState.enabled = offerCount >= 2;
  dualStreamState.stream1Used = multiOfferState.offerUsed.get(1) || new Set();
  dualStreamState.stream2Used = multiOfferState.offerUsed.get(2) || new Set();
  dualStreamState.stream1Index = multiOfferState.offerCursors.get(1) ?? 0;
  dualStreamState.stream2Index = multiOfferState.offerCursors.get(2) ?? -1;
}
