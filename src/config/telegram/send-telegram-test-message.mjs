import { loadTelegramConfig } from './load-telegram-config.mjs';

/**
 * Gửi 1 tin nhắn thử nghiệm tới Telegram để xác nhận token/chat id hợp lệ.
 *
 * @param {string} [text] Nội dung tin nhắn thử (mặc định: thông báo kiểm tra kết nối).
 * @return {Promise<{ok: boolean, message: string}>} Kết quả gửi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function sendTelegramTestMessage(text = '✅ AutoLeadPC: kết nối Telegram bot thành công!') {
  let config;
  try {
    config = await loadTelegramConfig();
  } catch {
    return {
      ok: false,
      message: 'Chưa có cấu hình Telegram. Hãy nhập Bot Token và Chat ID rồi lưu.'
    };
  }
  if (!config.botToken) return {
    ok: false,
    message: 'Thiếu Bot Token.'
  };
  const chatId = config.notifyChatId || config.allowedUserId;
  if (!chatId) return {
    ok: false,
    message: 'Thiếu Chat ID / User ID để gửi tin.'
  };
  try {
    const res = await fetch(`https://api.telegram.org/bot${config.botToken}/sendMessage`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML'
      })
    });
    const data = await res.json().catch(() => ({}));
    if (data?.ok) return {
      ok: true,
      message: `Đã gửi tin thử tới chat ${chatId}.`
    };
    return {
      ok: false,
      message: data?.description || `Telegram trả lỗi HTTP ${res.status}.`
    };
  } catch (error) {
    return {
      ok: false,
      message: `Không gọi được Telegram API: ${error.message}`
    };
  }
}
export { sendTelegramTestMessage };
