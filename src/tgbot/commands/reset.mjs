import { appPost } from '../app-post.mjs';
import { moduleState } from '../state/module-state.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram reset.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleResetCommand({
  chatId,
  name
}) {
  if (!(name === '/reset' || name === 'reset')) return false;
  await appPost('/limit-run/reset');
  moduleState.sessionLeadsAtBotStart = 0;
  moduleState.botStartTime = Date.now();
  await send(chatId, '🔄 Reset bộ đếm leads về 0.', [[{
    text: '📊 Status',
    cb: 'status'
  }]]);
  return true;
}

