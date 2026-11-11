import { offerStrategyState } from '../../../runtime/constants/offer-strategy-state.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API pc-offer-strategy-read.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetPcOfferStrategyRead(request, response) {
  if (request.method === 'GET' && request.url === '/pc/offer-strategy/read') {
    try {
      const strategies = {};
      for (const [num, strat] of offerStrategyState) {
        strategies[num] = strat;
      }
      respondWithJson(response, 200, {
        strategies
      });
    } catch (err) {
      respondWithJson(response, 400, {
        error: err.message
      });
    }
    return true;
  }
  return false;
}
