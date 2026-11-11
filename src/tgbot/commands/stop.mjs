import { BTN_STOPPED } from '../state/btn-stopped.mjs';
import { appPost } from '../app-post.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram stop.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleStopCommand({
  chatId,
  name
}) {
  if (!(name === '/stop' || name === 'stop')) return false;
  await appPost('/stop');
  await send(chatId, '🔴 Đã dừng tất cả.', BTN_STOPPED);
  return true;
}

