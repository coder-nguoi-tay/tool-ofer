import { appPost } from '../app-post.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram clear-log.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleClearLogCommand({
  chatId,
  name
}) {
  if (!(name === '/clear-log' || name === '/clearlog' || name === 'clear_log')) return false;
  const res = await appPost('/browser-logs/clear');
  await send(chatId, res.success ? '🗑 Đã xóa toàn bộ log và file HTML.' : `⚠️ Lỗi: ${res.error}`, [[{
    text: '📋 Log',
    cb: 'log'
  }, {
    text: '📊 Status',
    cb: 'status'
  }]]);
  return true;
}

