import { readRequestBody } from '../../http/actions/read-request-body.mjs';
import { respondWithJson } from '../../http/actions/respond-with-json.mjs';
import { loadAgentConfig, maskAgentConfig, saveAgentConfig } from '../agent-config.mjs';
import { createApiChatSession, resolveApiUrl } from '../api-chat-session.mjs';

const isLoopback = request => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket?.remoteAddress);

/**
 * API cấu hình agent: GET /agent/api/config (đã che key), POST /agent/api/config (lưu từng phần),
 * POST /agent/api/test (gọi thử một câu để kiểm tra URL/key/model). Ghi và test chỉ nhận từ loopback
 * vì app có thể chạy `--public`; key không bao giờ nằm trong phản hồi.
 *
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export async function handleAgentApiConfig(request, response) {
  const { method, url } = request;
  if (!['/agent/api/config', '/agent/api/test'].includes(url)) return false;
  if (method === 'GET' && url === '/agent/api/config') { respondWithJson(response, 200, maskAgentConfig(loadAgentConfig())); return true; }
  if (method !== 'POST') return false;
  if (!isLoopback(request)) { respondWithJson(response, 403, { error: 'Chỉ cho phép từ máy chạy app' }); return true; }
  try {
    const body = JSON.parse((await readRequestBody(request)) || '{}');
    if (url === '/agent/api/config') {
      // Kiểm URL theo cấu hình sau khi gộp (format/model đi cùng URL) trước khi ghi file.
      const merged = { ...loadAgentConfig(undefined, {}), ...Object.fromEntries(['apiFormat', 'apiBaseUrl', 'apiModel'].filter(key => typeof body[key] === 'string').map(key => [key, body[key].trim()])) };
      if (merged.apiBaseUrl) resolveApiUrl(merged.apiBaseUrl, merged.apiFormat, merged.apiModel);
      const saved = saveAgentConfig(body);
      respondWithJson(response, 200, { success: true, config: maskAgentConfig(saved) });
      return true;
    }
    const config = loadAgentConfig();
    const session = createApiChatSession({ format: config.apiFormat, baseUrl: config.apiBaseUrl, apiKey: config.apiKey, model: config.apiModel, timeoutMs: 30_000 });
    const startedAt = Date.now();
    const { text } = await session.send('Reply with exactly: OK');
    respondWithJson(response, 200, { ok: true, ms: Date.now() - startedAt, reply: text.slice(0, 60) });
  } catch (error) {
    respondWithJson(response, url === '/agent/api/test' ? 200 : 400, { ok: false, error: error.message });
  }
  return true;
}
