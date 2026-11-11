import { BTN_MAIN } from '../state/btn-main.mjs';
import { registerBotCommands } from '../register-bot-commands.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram help.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleHelpCommand({
  chatId,
  name
}) {
  if (!(name === '/help' || name === '/start' || name === 'help')) return false;
  void registerBotCommands();
  const hasAi = !!process.env.ANTHROPIC_API_KEY;
  await send(chatId, `<b>🤖 AutoLeadPC Bot</b>${hasAi ? ' <i>+ AI</i>' : ''}\n\n` + (hasAi ? '💬 Chat tự nhiên — AI hiểu và thực hiện.\nHoặc dùng các lệnh quản lý:\n\n' : 'Các lệnh quản lý:\n\n') + `<b>Điều khiển:</b>\n` + `/status — Trạng thái tổng thể\n` + `/run [n] — Bật tự bù n luồng\n` + `/pause — Tạm dừng mở slot mới\n` + `/stop — Dừng toàn bộ luồng\n\n` + `<b>Giám sát & Slot:</b>\n` + `/bw — Băng thông hôm nay & số dư 711Proxy\n` + `/screen [slot] — Chụp màn hình trực tiếp slot\n` + `/slots — Danh sách các slot đang chạy\n` + `/close [slot] — Tắt riêng 1 slot (không bù lại)\n\n` + `<b>Proxy & Email:</b>\n` + `/proxy — Hàng đợi proxy\n` + `/buy — Mua proxy từ 711proxy\n` + `/clearproxy — Xóa tất cả proxy trong hàng đợi\n` + `/email — Hàng đợi email\n\n` + `<b>Thống kê:</b>\n` + `/done /speed /reset /log /clear-log`, BTN_MAIN);
  return true;
}

