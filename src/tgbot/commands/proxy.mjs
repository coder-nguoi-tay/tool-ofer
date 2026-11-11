import { appGet } from '../app-get.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram proxy.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleProxyCommand({
  chatId,
  name
}) {
  if (!(name === '/proxy' || name === 'proxy')) return false;
  const pq = await appGet('/proxy-queue');
  await send(chatId, `<b>📦 Proxy</b>\nCòn: <b>${pq.available}</b> / Dùng: ${pq.used}\nDual stream: ${pq.dualStream ? '✅' : '❌'}`, pq.available < 20 ? [[{
    text: '🛒 Mua thêm proxy',
    cb: 'buy'
  }, {
    text: '📊 Status',
    cb: 'status'
  }]] : [[{
    text: '📊 Status',
    cb: 'status'
  }, {
    text: '🗑 Xóa tất cả proxy',
    cb: 'clear_proxy'
  }]]);
  return true;
}

