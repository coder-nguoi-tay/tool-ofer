import { activeExitIpLocks } from '../../runtime/constants/active-exit-ip-locks.mjs';
import { activeProxyLocks } from '../../runtime/constants/active-proxy-locks.mjs';
import { dualStreamState } from '../../runtime/constants/dual-stream-state.mjs';
import { multiOfferState } from '../../runtime/constants/multi-offer-state.mjs';

/**
 * Đặt lại toàn bộ trạng thái đa offer và khóa proxy.
 * @return {void} Kết quả xử lý reset multi offer state.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function resetMultiOfferState() {
  activeProxyLocks.clear();
  activeExitIpLocks.clear();
  multiOfferState.enabled = false;
  multiOfferState.offerCount = 1;
  multiOfferState.offerUrls = [];
  multiOfferState.offerUsed.clear();
  multiOfferState.offerCursors.clear();
  multiOfferState.offerDirections.clear();
  dualStreamState.stream1Index = 0;
  dualStreamState.stream2Index = -1;
  dualStreamState.stream1Used.clear();
  dualStreamState.stream2Used.clear();
}
