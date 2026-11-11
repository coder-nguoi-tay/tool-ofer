import { appPost } from '../app-post.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram clearproxy.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleClearproxyCommand({
  chatId,
  name
}) {
  if (!(name === '/clearproxy' || name === '/clear_proxy' || name === 'clearproxy' || name === 'clear_proxy')) return false;

  // Xóa toàn bộ proxy trong hàng đợi + ô nhập danh sách (giống nút trên giao diện web).
  const res = await appPost('/proxy-queue/clear').catch(e => ({
    error: e.message
  }));
  if (res?.error) {
    await send(chatId, `❌ Xóa proxy thất bại: ${res.error}`, [[{
      text: '📦 Proxy',
      cb: 'proxy'
    }]]);
  } else {
    await send(chatId, `🗑 <b>Đã xóa tất cả proxy</b>\n${res?.message || 'Hàng đợi proxy đã được làm trống.'}`, [[{
      text: '📦 Proxy',
      cb: 'proxy'
    }, {
      text: '📊 Status',
      cb: 'status'
    }]]);
  }
  return true;
}

