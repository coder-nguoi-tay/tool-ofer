import { answerCallback } from './answer-callback.mjs';
import { execCommand } from './exec-command.mjs';

/**
 * Handle callback.
 * @param {*} chatId chat id.
 * @param {*} userId user id.
 * @param {*} callbackId callback id.
 * @param {*} data data.
 * @return {Promise<void>} Kết quả xử lý handle callback.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleCallback(chatId, userId, callbackId, data) {
  await answerCallback(callbackId);
  // run_N → /run N
  if (data.startsWith('run_')) {
    const n = parseInt(data.slice(4), 10);
    await execCommand(chatId, userId, n > 0 ? `/run ${n}` : '/run_keep');
  } else if (data.startsWith('screen_')) {
    const slot = parseInt(data.slice(7), 10);
    await execCommand(chatId, userId, slot ? `/screen ${slot}` : '/screen');
  } else if (data.startsWith('close_slot_')) {
    const slot = parseInt(data.slice(11), 10);
    await execCommand(chatId, userId, slot ? `/close ${slot}` : '/close');
  } else {
    await execCommand(chatId, userId, data);
  }
}
export { handleCallback };
