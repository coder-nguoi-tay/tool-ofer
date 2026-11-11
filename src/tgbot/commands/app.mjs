import { appGet } from '../app-get.mjs';
import { appPost } from '../app-post.mjs';
import { send } from '../send.mjs';
import { tgPost } from '../tg-post.mjs';

/**
 * Xử lý lệnh Telegram app.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleAppCommand({
  chatId,
  name
}) {
  if (!(name === '/app' || name === '/mini' || name === '/live' || name === 'app' || name === 'mini' || name === 'live')) return false;
  let tunnel = await appGet('/tunnel').catch(() => null);
  if (!tunnel?.url) {
    await send(chatId, '⏳ Đang khởi tạo kết nối Cloudflare Tunnel HTTPS cho Telegram Mini App...');
    tunnel = await appPost('/tunnel/start').catch(() => null);
  }
  if (tunnel?.url) {
    const miniUrl = `${tunnel.url}/screen-mini`;
    void tgPost('setChatMenuButton', {
      chat_id: chatId,
      menu_button: {
        type: 'web_app',
        text: '📺 Màn hình',
        web_app: {
          url: miniUrl
        }
      }
    }).catch(() => {});
    await send(chatId, `📱 <b>AutoLeadPC - Điều Khiển Trực Tiếp</b>\n\n` + `Nhấn nút bên dưới để mở giao diện Mini App ngay trong Telegram:\n` + `• <b>Chạm màn hình</b> để click chuột thực tế.\n` + `• <b>Vuốt lên / xuống</b> để cuộn trang.\n` + `• <b>Gõ bàn phím</b> để điền chữ vào Chrome.\n` + `• Xem Live Stream thời gian thực (60fps) của từng slot.\n\n` + `🔗 <i>Link web:</i> <a href="${miniUrl}">${miniUrl}</a>`, [[{
      text: '📺 Mở Trực Tiếp Chrome (Live)',
      web_app: {
        url: miniUrl
      }
    }], [{
      text: '📊 Status',
      cb: 'status'
    }, {
      text: '🌐 DS Slot',
      cb: 'slots'
    }]]);
  } else {
    await send(chatId, `⚠️ Chưa thể tạo đường truyền HTTPS tự động (${tunnel?.error || 'timeout'}).\nBạn có thể dùng lệnh /screen để xem ảnh chụp màn hình Chrome.`, [[{
      text: '📺 Chụp ảnh /screen',
      cb: 'screen'
    }, {
      text: '📊 Status',
      cb: 'status'
    }]]);
  }
  return true;
}

