import { readRequestBody } from '../../actions/read-request-body.mjs';
import { remoteAgents } from '../../../runtime/constants/remote-agents.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API agents-config.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostAgentsConfig(request, response) {
  if (request.method === 'POST' && request.url === '/agents/config') {
    const body = JSON.parse(await readRequestBody(request));
    const agent = body.agentId ? remoteAgents.get(body.agentId) : null;
    if (!agent) {
      respondWithJson(response, 404, {
        error: 'Agent not found'
      });
      return true;
    }
    agent.enabled = typeof body.enabled === 'boolean' ? body.enabled : !agent.enabled;
    respondWithJson(response, 200, {
      agentId: body.agentId,
      enabled: agent.enabled
    });
    return true;
  }
  return false;
}
