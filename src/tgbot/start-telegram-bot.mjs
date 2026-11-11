import { BTN_RUNNING } from './state/btn-running.mjs';
import { BTN_STOPPED } from './state/btn-stopped.mjs';
import { appGet } from './app-get.mjs';
import { checkAndNotify } from './check-and-notify.mjs';
import { dataDirName } from './state/data-dir-name.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { moduleState } from './state/module-state.mjs';
import { pollUpdates } from './poll-updates.mjs';
import { readFile } from 'node:fs/promises';
import { registerBotCommands } from './register-bot-commands.mjs';
import { tgNotify } from './tg-notify.mjs';

/**
 * Khởi động bot Telegram: đọc config, chạy vòng poll update và timer thông báo.
 *
 * @return {Promise<boolean>} true nếu bot đã khởi động (có botToken + allowedUserId).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function startTelegramBot() {
  const configPath = join(homedir(), 'Library', 'Application Support', dataDirName, 'telegram-config.json');
  try {
    const raw = JSON.parse(await readFile(configPath, 'utf8'));
    if (!raw.botToken || !raw.allowedUserId) return false;
    moduleState.cfg = raw;
    moduleState.notifyChatId = raw.notifyChatId ?? null;
    console.log('[TGBot] Đã khởi động, allowedUserId:', moduleState.cfg.allowedUserId);
  } catch {
    return false;
  }

  // Đăng ký menu gợi ý lệnh khi gõ "/"
  void registerBotCommands();
  const generation = ++moduleState.botGeneration;
  try {
    const state = await appGet('/state');
    moduleState.sessionLeadsAtBotStart = state.limitRun?.count ?? 0;
    moduleState.lastLimitRunCount = moduleState.sessionLeadsAtBotStart;
  } catch {}
  const poll = async () => {
    if (generation !== moduleState.botGeneration) return;
    try {
      await pollUpdates();
    } catch {}
    if (generation !== moduleState.botGeneration) return;
    setTimeout(poll, 1000);
  };
  void poll();
  moduleState.notifyTimer = setInterval(() => {
    if (generation !== moduleState.botGeneration) return;
    void checkAndNotify();
  }, 30_000);
  if (moduleState.cfg.notifyChatId) {
    moduleState.notifyChatId = moduleState.cfg.notifyChatId;
    const state = await appGet('/state').catch(() => null);
    const running = state?.enabled && !state?.stopRequested;
    await tgNotify(`🤖 <b>AutoLeadPC đã khởi động</b> lúc ${new Date().toLocaleTimeString('vi-VN')}`, running ? BTN_RUNNING : BTN_STOPPED);
  }
  return true;
}
export { startTelegramBot };
