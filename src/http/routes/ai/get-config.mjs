import { loadAiConfig } from '../../../config/ai.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API ai-config.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetAiConfig(request, response) {
  if (request.method === 'GET' && request.url === '/ai/config') {
    const cfg = loadAiConfig();
    respondWithJson(response, 200, cfg);
    return true;
  }
  return false;
}
