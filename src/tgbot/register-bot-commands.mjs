import { BOT_COMMANDS } from './state/bot-commands.mjs';
import { appGet } from './app-get.mjs';
import { appPost } from './app-post.mjs';
import { moduleState } from './state/module-state.mjs';
import { tgPost } from './tg-post.mjs';

/**
 * Đăng ký danh sách commands và nút Menu với Telegram API
 * Giúp người dùng khi gõ "/" sẽ tự động hiện danh sách gợi ý kèm mô tả tiếng Việt.
 * @param {number} maxRetries max retries.
 * @return {Promise<*>} Kết quả xử lý register bot commands.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function registerBotCommands(maxRetries = 3) {
  if (!moduleState.cfg?.botToken) return false;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let tunnel = await appGet('/tunnel').catch(() => null);
      if (!tunnel?.url) {
        tunnel = await appPost('/tunnel/start').catch(() => null);
      }
      const menuButton = tunnel?.url ? {
        type: 'web_app',
        text: '📺 Màn hình',
        web_app: {
          url: `${tunnel.url}/screen-mini`
        }
      } : {
        type: 'commands'
      };
      const promises = [tgPost('setMyCommands', {
        commands: BOT_COMMANDS
      }), tgPost('setChatMenuButton', {
        menu_button: menuButton
      })];
      if (moduleState.cfg.allowedUserId) {
        promises.push(tgPost('setChatMenuButton', {
          chat_id: moduleState.cfg.allowedUserId,
          menu_button: menuButton
        }));
      }
      if (moduleState.cfg.notifyChatId && moduleState.cfg.notifyChatId !== moduleState.cfg.allowedUserId) {
        promises.push(tgPost('setChatMenuButton', {
          chat_id: moduleState.cfg.notifyChatId,
          menu_button: menuButton
        }));
      }
      const results = await Promise.all(promises);
      const cmdRes = results[0];
      const btnRes = results[1];
      if (cmdRes?.ok) {
        console.log('[TGBot] Đã đăng ký gợi ý lệnh Telegram (setMyCommands) thành công');
      }
      if (btnRes?.ok && tunnel?.url) {
        console.log('[TGBot] Đã kích hoạt Menu WebApp:', `${tunnel.url}/screen-mini`);
      }
      if (cmdRes?.ok) return true;
    } catch (err) {
      if (attempt === maxRetries) {
        console.warn('[TGBot] Lỗi gọi setMyCommands:', err.message);
        return false;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return false;
}
export { registerBotCommands };
