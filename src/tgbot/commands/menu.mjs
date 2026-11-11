import { BTN_MAIN } from '../state/btn-main.mjs';
import { registerBotCommands } from '../register-bot-commands.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram menu.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleMenuCommand({
  chatId,
  name
}) {
  if (!(name === '/menu' || name === 'menu')) return false;
  void registerBotCommands();
  await send(chatId, '📋 <b>Menu lệnh điều khiển:</b>\nBạn có thể gõ <code>/</code> trên bàn phím hoặc nhấn nút <b>Menu</b> ở góc dưới bên trái để chọn nhanh các lệnh.', BTN_MAIN);
  return true;
}

