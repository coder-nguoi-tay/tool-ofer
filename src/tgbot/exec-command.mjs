import { commandHandlers } from './commands/index.mjs';
import { APP_BASE } from './state/app-base.mjs';
import { BTN_MAIN } from './state/btn-main.mjs';
import { BTN_RUNNING } from './state/btn-running.mjs';
import { BTN_STOPPED } from './state/btn-stopped.mjs';
import { aiChat } from './ai-chat.mjs';
import { appGet } from './app-get.mjs';
import { appPost } from './app-post.mjs';
import { moduleState } from './state/module-state.mjs';
import { readAutoRefillSettings } from './read-auto-refill-settings.mjs';
import { registerBotCommands } from './register-bot-commands.mjs';
import { send } from './send.mjs';
import { sendPhoto } from './send-photo.mjs';
import { suggestionsToButtons } from './suggestions-to-buttons.mjs';
import { tgPost } from './tg-post.mjs';

/**
 * Xử lý lệnh điều khiển ứng dụng được gửi từ Telegram.
 * @param {*} chatId chat id.
 * @param {*} userId user id.
 * @param {string} cmdText cmd text.
 * @return {Promise<void>} Kết quả xử lý exec command.
 * @throws {Error} Khi dữ liệu không hợp lệ hoặc thao tác không thể hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function execCommand(chatId, userId, cmdText) {
  if (userId !== moduleState.cfg.allowedUserId) return;
  if (moduleState.notifyChatId === null) moduleState.notifyChatId = chatId;
  const cmd = cmdText.trim().split(/\s+/);
  const name = cmd[0].toLowerCase();
  const commandContext = {
    chatId,
    userId,
    cmdText,
    execCommand,
    cmd,
    name
  };
  for (const handleCommand of commandHandlers) {
    if (await handleCommand(commandContext)) return;
  }
}
export { execCommand };

