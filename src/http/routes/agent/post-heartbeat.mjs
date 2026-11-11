import { readRequestBody } from '../../actions/read-request-body.mjs';
import { remoteAgents } from '../../../runtime/constants/remote-agents.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API agent-heartbeat.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostAgentHeartbeat(request, response) {
  if (request.method === 'POST' && request.url === '/agent/heartbeat') {
    const body = JSON.parse(await readRequestBody(request));
    const agent = remoteAgents.get(body.agentId);
    if (agent) {
      agent.lastSeen = Date.now();
      agent.freeSlots = body.freeSlots ?? agent.freeSlots;
    }
    respondWithJson(response, 200, {
      ok: true
    });
    return true;
  }
  return false;
}
