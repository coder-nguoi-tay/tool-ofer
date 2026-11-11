import { loadTelegramConfig } from '../../../config/telegram.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';

/**
 * Xử lý API telegram-config.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleGetTelegramConfig(request, response) {
  if (request.method === 'GET' && request.url === '/telegram/config') {
    try {
      const config = await loadTelegramConfig();
      respondWithJson(response, 200, {
        botTokenMasked: config.botToken ? `${config.botToken.slice(0, 8)}…${config.botToken.slice(-4)}` : '',
        hasToken: Boolean(config.botToken),
        allowedUserId: config.allowedUserId || '',
        notifyChatId: config.notifyChatId || '',
        configured: Boolean(config.botToken && config.allowedUserId)
      });
    } catch {
      respondWithJson(response, 200, {
        botTokenMasked: '',
        hasToken: false,
        allowedUserId: '',
        notifyChatId: '',
        configured: false
      });
    }
    return true;
  }
  return false;
}
