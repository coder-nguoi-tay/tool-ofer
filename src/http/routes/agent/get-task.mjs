import { pendingAgentTasks } from '../../../runtime/constants/pending-agent-tasks.mjs';
import { remoteAgents } from '../../../runtime/constants/remote-agents.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API agent-task.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetAgentTask(request, response) {
  if (request.method === 'GET' && request.url.startsWith('/agent/task')) {
    const agentId = new URL(request.url, 'http://x').searchParams.get('agentId');
    const agent = agentId ? remoteAgents.get(agentId) : null;
    if (agent) agent.lastSeen = Date.now();
    respondWithJson(response, 200, {
      task: pendingAgentTasks.shift() ?? null
    });
    return true;
  }
  return false;
}
