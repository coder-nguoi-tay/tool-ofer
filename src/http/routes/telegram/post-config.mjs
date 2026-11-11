import { readRequestBody } from '../../actions/read-request-body.mjs';
import { reloadTelegramBot } from '../../../../tgbot.mjs';
import { respondWithJson } from '../../actions/respond-with-json.mjs';
import { saveTelegramConfig } from '../../../config/telegram.mjs';

/**
 * Xử lý API telegram-config.
 * @param {import('node:http').IncomingMessage} request Yêu cầu HTTP.
 * @param {import('node:http').ServerResponse} response Phản hồi HTTP.
 * @return {Promise<boolean>} True khi handler đã xử lý yêu cầu.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePostTelegramConfig(request, response) {
  if (request.method === 'POST' && request.url === '/telegram/config') {
    try {
      const body = JSON.parse(await readRequestBody(request));
      const botToken = String(body.botToken || '').trim();
      const allowedUserId = Number(body.allowedUserId);
      const notifyChatId = body.notifyChatId ? Number(body.notifyChatId) : null;
      if (!botToken || !/^\d+:[A-Za-z0-9_-]+$/.test(botToken)) {
        respondWithJson(response, 400, {
          ok: false,
          message: 'Bot Token không hợp lệ (dạng 123456789:AA...).'
        });
        return true;
      }
      if (!Number.isFinite(allowedUserId) || allowedUserId <= 0) {
        respondWithJson(response, 400, {
          ok: false,
          message: 'User ID Telegram không hợp lệ (chỉ gồm chữ số).'
        });
        return true;
      }
      await saveTelegramConfig({
        botToken,
        allowedUserId,
        notifyChatId
      });
      const reload = await reloadTelegramBot().catch(error => ({
        running: false,
        error: error.message
      }));
      respondWithJson(response, 200, {
        ok: true,
        running: Boolean(reload?.running),
        message: reload?.running ? 'Đã lưu cấu hình và khởi động lại Telegram bot.' : `Đã lưu cấu hình nhưng bot chưa chạy${reload?.error ? `: ${reload.error}` : ' (kiểm tra lại token/quyền).'}`
      });
    } catch (error) {
      respondWithJson(response, 500, {
        ok: false,
        message: `Lưu cấu hình Telegram thất bại: ${error.message}`
      });
    }
    return true;
  }
  return false;
}
