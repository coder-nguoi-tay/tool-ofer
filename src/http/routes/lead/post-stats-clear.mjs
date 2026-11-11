import { clearLeadIpStats } from '../../../../lead-check.mjs';
import { queueSaveLeadStats } from "../../../leads/statistics/queue-save-lead-stats.mjs";
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API lead-stats-clear.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostLeadStatsClear(request, response) {
  if (request.method === 'POST' && request.url === '/lead-stats/clear') {
    clearLeadIpStats();
    queueSaveLeadStats();
    respondWithJson(response, 200, {
      success: true,
      message: 'Đã xóa toàn bộ dữ liệu thống kê IP lead.'
    });
    return true;
  }
  return false;
}
