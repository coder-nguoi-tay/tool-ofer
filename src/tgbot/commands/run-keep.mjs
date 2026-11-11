import { APP_BASE } from '../state/app-base.mjs';
import { appGet } from '../app-get.mjs';
import { appPost } from '../app-post.mjs';
import { readAutoRefillSettings } from '../read-auto-refill-settings.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram run-keep.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleRunKeepCommand({
  chatId,
  name
}) {
  if (!(name === '/run_keep')) return false;
  const saved = await readAutoRefillSettings();
  const keepN = saved?.targetCount || 1;
  if (saved?.settings) {
    fetch(`${APP_BASE}/launch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...saved.settings,
        requestedCount: keepN
      })
    }).catch(() => {});
    await send(chatId, `⏳ Đang khởi động <b>${keepN} luồng</b> (giữ nguyên)…`, [[{
      text: '📊 Status',
      cb: 'status'
    }, {
      text: '🛑 Stop',
      cb: 'stop'
    }]]);
  } else {
    await appPost('/auto-refill', {
      enabled: true
    });
    const cur = await appGet('/state').catch(() => ({}));
    await send(chatId, `🟢 Đã bật — <b>${cur.targetCount} luồng</b>.`, [[{
      text: '📊 Status',
      cb: 'status'
    }, {
      text: '🛑 Stop',
      cb: 'stop'
    }]]);
  }
  return true;
}

