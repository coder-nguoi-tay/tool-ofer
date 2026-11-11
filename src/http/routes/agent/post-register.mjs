import { randomUUID } from 'node:crypto';
import { readRequestBody } from '../../actions/read-request-body.mjs';
import { remoteAgents } from '../../../runtime/constants/remote-agents.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API agent-register.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostAgentRegister(request, response) {
  if (request.method === 'POST' && request.url === '/agent/register') {
    const body = JSON.parse(await readRequestBody(request));
    const agentId = body.agentId || randomUUID();
    const existing = remoteAgents.get(agentId);
    remoteAgents.set(agentId, {
      platform: body.platform ?? 'unknown',
      hostname: body.hostname ?? agentId,
      maxSlots: body.maxSlots ?? 5,
      freeSlots: existing?.freeSlots ?? body.maxSlots ?? 5,
      activeTasks: existing?.activeTasks ?? 0,
      lastSeen: Date.now(),
      enabled: existing?.enabled ?? true
    });
    respondWithJson(response, 200, {
      agentId,
      ok: true
    });
    return true;
  }
  return false;
}
