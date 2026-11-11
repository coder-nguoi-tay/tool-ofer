import { activeProxyLocks } from '../../../runtime/constants/active-proxy-locks.mjs';
import { dualStreamState } from '../../../runtime/constants/dual-stream-state.mjs';
import { multiOfferState } from '../../../runtime/constants/multi-offer-state.mjs';
import { proxyQueue } from '../../../runtime/constants/proxy-queue.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API proxy-queue.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetProxyQueue(request, response) {
  if (request.method === 'GET' && request.url === '/proxy-queue') {
    const allOfferUsed = new Set([...dualStreamState.stream1Used, ...dualStreamState.stream2Used, ...[...multiOfferState.offerUsed.values()].flatMap(set => [...set])]);
    const multiUsedCount = multiOfferState.enabled || dualStreamState.enabled ? allOfferUsed.size : proxyQueue.used.length;
    respondWithJson(response, 200, {
      available: proxyQueue.available.length,
      used: Math.max(proxyQueue.used.length, multiUsedCount),
      usedList: proxyQueue.used,
      dualStream: dualStreamState.enabled || multiOfferState.enabled,
      stream1Index: dualStreamState.stream1Index,
      stream2Index: dualStreamState.stream2Index,
      multiOffer: {
        enabled: multiOfferState.enabled,
        offerCount: multiOfferState.offerCount,
        activeLocks: activeProxyLocks.size
      }
    });
    return true;
  }
  return false;
}
