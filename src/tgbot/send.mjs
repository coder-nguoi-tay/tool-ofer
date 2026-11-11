import { formatInlineButtons } from './format-inline-buttons.mjs';
import { tgPost } from './tg-post.mjs';

/**
 * Send.
 * @param {*} chatId chat id.
 * @param {string} text text.
 * @param {*} buttons buttons.
 * @return {Promise<*>} Kết quả xử lý send.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function send(chatId, text, buttons = null) {
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML'
  };
  const formatted = formatInlineButtons(buttons);
  if (formatted?.length) {
    body.reply_markup = {
      inline_keyboard: formatted
    };
  }
  return tgPost('sendMessage', body).catch(() => {});
}
export { send };
