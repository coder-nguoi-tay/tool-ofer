import { formatInlineButtons } from './format-inline-buttons.mjs';
import { moduleState } from './state/module-state.mjs';

/**
 * Send photo.
 * @param {*} chatId chat id.
 * @param {*} imageBuffer image buffer.
 * @param {string} caption caption.
 * @param {*} buttons buttons.
 * @return {Promise<*>} Kết quả xử lý send photo.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function sendPhoto(chatId, imageBuffer, caption = '', buttons = null) {
  if (!moduleState.cfg?.botToken) return null;
  const formData = new FormData();
  formData.append('chat_id', String(chatId));
  const blob = new Blob([imageBuffer], {
    type: 'image/jpeg'
  });
  formData.append('photo', blob, 'screenshot.jpg');
  if (caption) {
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
  }
  const formatted = formatInlineButtons(buttons);
  if (formatted?.length) {
    formData.append('reply_markup', JSON.stringify({
      inline_keyboard: formatted
    }));
  }
  const r = await fetch(`https://api.telegram.org/bot${moduleState.cfg.botToken}/sendPhoto`, {
    method: 'POST',
    body: formData
  });
  return r.json().catch(() => ({}));
}
export { sendPhoto };
