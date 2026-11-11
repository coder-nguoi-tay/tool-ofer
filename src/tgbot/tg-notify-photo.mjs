import { moduleState } from './state/module-state.mjs';
import { sendPhoto } from './send-photo.mjs';

/**
 * Tg notify photo.
 * @param {*} imageBuffer image buffer.
 * @param {string} caption caption.
 * @param {*} buttons buttons.
 * @return {Promise<void>} Kết quả xử lý tg notify photo.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function tgNotifyPhoto(imageBuffer, caption = '', buttons = null) {
  if (!moduleState.cfg || !moduleState.notifyChatId) return;
  await sendPhoto(moduleState.notifyChatId, imageBuffer, caption, buttons);
}
export { tgNotifyPhoto };
