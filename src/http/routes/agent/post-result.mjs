import { autoRefill } from '../../../runtime/constants/auto-refill.mjs';
import { queueAutomaticRefill } from '../../../refill/actions/queue-automatic-refill.mjs';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { remoteAgents } from '../../../runtime/constants/remote-agents.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API agent-result.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostAgentResult(request, response) {
  if (request.method === 'POST' && request.url === '/agent/result') {
    const body = JSON.parse(await readRequestBody(request));
    const agent = body.agentId ? remoteAgents.get(body.agentId) : null;
    if (agent) {
      agent.activeTasks = Math.max(0, agent.activeTasks - 1);
      agent.freeSlots = Math.min(agent.maxSlots, agent.freeSlots + 1);
      agent.lastSeen = Date.now();
    }
    if (autoRefill.enabled) queueAutomaticRefill();
    respondWithJson(response, 200, {
      ok: true
    });
    return true;
  }
  return false;
}
