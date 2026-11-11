import { pendingAgentTasks } from '../../../runtime/constants/pending-agent-tasks.mjs';
import { pruneStaleAgents } from '../../../agents/actions/prune-stale-agents.mjs';
import { remoteAgents } from '../../../runtime/constants/remote-agents.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API agents.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetAgentsIndex(request, response) {
  if (request.method === 'GET' && request.url === '/agents') {
    pruneStaleAgents();
    respondWithJson(response, 200, {
      agents: [...remoteAgents.entries()].map(([id, a]) => ({
        agentId: id,
        platform: a.platform,
        hostname: a.hostname,
        maxSlots: a.maxSlots,
        freeSlots: a.freeSlots,
        activeTasks: a.activeTasks,
        enabled: a.enabled,
        online: Date.now() - a.lastSeen < 30_000
      })),
      pendingTasks: pendingAgentTasks.length
    });
    return true;
  }
  return false;
}
