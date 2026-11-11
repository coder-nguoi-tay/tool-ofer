import { moduleState } from './state/module-state.mjs';
import { send } from './send.mjs';

/**
 * Tg notify.
 * @param {string} text text.
 * @param {*} buttons buttons.
 * @return {Promise<void>} Kết quả xử lý tg notify.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function tgNotify(text, buttons = null) {
  if (!moduleState.cfg || !moduleState.notifyChatId) return;
  await send(moduleState.notifyChatId, text, buttons);
}
export { tgNotify };
