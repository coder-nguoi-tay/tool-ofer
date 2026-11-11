import { appPost } from '../app-post.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram pause.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePauseCommand({
  chatId,
  name
}) {
  if (!(name === '/pause' || name === 'pause')) return false;
  await appPost('/auto-refill', {
    enabled: false
  });
  await send(chatId, '⏸ Đã tạm dừng mở slot mới. Session đang chạy vẫn tiếp tục.', [[{
    text: '▶ Tiếp tục',
    cb: 'run'
  }, {
    text: '🛑 Stop hẳn',
    cb: 'stop'
  }, {
    text: '📊 Status',
    cb: 'status'
  }]]);
  return true;
}

