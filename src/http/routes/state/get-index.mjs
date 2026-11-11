import { applicationState } from '../../../runtime/application-state.mjs';
import { getAutoRefillStatus } from '../../../refill/actions/get-auto-refill-status.mjs';
import { latestToffersOverview } from '../../../leads/toffers-overview.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API state.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetStateIndex(request, response) {
  if (request.method === 'GET' && request.url === '/state') {
    try {
      const stateBody = {
        ...getAutoRefillStatus(),
        limitRun: {
          count: applicationState.limitRunCount,
          max: applicationState.limitRunMax
        },
        toffers: {
          point: latestToffersOverview.point,
          leadCount: latestToffersOverview.results?.length || 0,
          updatedAt: latestToffersOverview.updatedAt
        }
      };
      respondWithJson(response, 200, stateBody);
    } catch (stateErr) {
      // /state từng treo vĩnh viễn khi có exception đồng bộ (object vòng/undefined).
      // Trả 500 kèm message + 3 khung đầu của stack để chẩn đoán nhanh.
      console.error('[State] Lỗi dựng state:', stateErr?.stack?.split('\n').slice(0, 4).join(' | ') || stateErr?.message);
      respondWithJson(response, 500, {
        error: String(stateErr?.message || stateErr),
        stackTop: String(stateErr?.stack || '').split('\n').slice(0, 4)
      });
    }
    return true;
  }
  return false;
}
