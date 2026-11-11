import { applicationState } from '../../../runtime/application-state.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API limit-run-reset.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostLimitRunReset(request, response) {
  if (request.method === 'POST' && request.url === '/limit-run/reset') {
    applicationState.limitRunCount = 0;
    applicationState.limitRunMax = 0;
    respondWithJson(response, 200, {
      message: 'Đã đặt lại bộ đếm limitRun về 0.'
    });
    return true;
  }
  return false;
}
