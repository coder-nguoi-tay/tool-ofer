import { APP_BASE } from '../state/app-base.mjs';
import { appGet } from '../app-get.mjs';
import { appPost } from '../app-post.mjs';
import { readAutoRefillSettings } from '../read-auto-refill-settings.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram run.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleRunCommand({
  cmd,
  chatId,
  name
}) {
  if (!(name === '/run' || name === 'run')) return false;
  const n = parseInt(cmd[1], 10);
  if (!n) {
    // Không có số → hiện menu chọn số luồng
    const state = await appGet('/state').catch(() => ({}));
    const cur = state.targetCount || 0;
    await send(chatId, `▶ <b>Chọn số luồng muốn chạy</b>${cur > 0 ? ` (hiện tại: ${cur})` : ''}:`, [[{
      text: '1 luồng',
      cb: 'run_1'
    }, {
      text: '2 luồng',
      cb: 'run_2'
    }, {
      text: '3 luồng',
      cb: 'run_3'
    }], [{
      text: '5 luồng',
      cb: 'run_5'
    }, {
      text: '8 luồng',
      cb: 'run_8'
    }, {
      text: '10 luồng',
      cb: 'run_10'
    }], [{
      text: '15 luồng',
      cb: 'run_15'
    }, {
      text: '20 luồng',
      cb: 'run_20'
    }, {
      text: `Giữ nguyên (${cur || '?'})`,
      cb: 'run_0'
    }]]);
    return true;
  }
  const saved = await readAutoRefillSettings();
  if (saved?.settings) {
    // Fire-and-forget /launch (nó chạy lâu, không await)
    fetch(`${APP_BASE}/launch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ...saved.settings,
        requestedCount: n
      })
    }).catch(() => {});
    await send(chatId, `⏳ Đang khởi động <b>${n} luồng</b>…\nGõ /status sau vài giây để xem tiến trình.`, [[{
      text: '📊 Status',
      cb: 'status'
    }, {
      text: '🛑 Stop',
      cb: 'stop'
    }]]);
  } else {
    await appPost('/auto-refill', {
      enabled: true,
      targetCount: n
    });
    await send(chatId, `⚠️ Chưa có cấu hình lưu sẵn.\nVui lòng nhấn <b>Start</b> trong app 1 lần, sau đó <b>/run</b> từ Telegram sẽ tự chạy.`, [[{
      text: '📊 Status',
      cb: 'status'
    }]]);
  }
  return true;
}

