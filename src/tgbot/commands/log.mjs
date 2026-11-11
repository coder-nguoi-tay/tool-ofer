import { appGet } from '../app-get.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram log.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleLogCommand({
  chatId,
  name
}) {
  if (!(name === '/log' || name === 'log')) return false;
  const [state, logs] = await Promise.all([appGet('/state'), appGet('/browser-logs').catch(() => ({
    sessions: []
  }))]);
  const sessions = logs.sessions ?? [];
  const lines = sessions.slice(0, 3).map((s, i) => {
    const last = s.logs?.slice(-1)[0];
    return `${i + 1}. [${s.ip ?? '?'}] ${last?.type ?? 'n/a'}: ${String(last?.detail ?? last?.url ?? '').slice(0, 60)}`;
  });
  await send(chatId, `<b>📋 Log</b>\n${lines.join('\n') || 'Chưa có session.'}\n\n💬 ${state.message}`, [[{
    text: '📊 Status',
    cb: 'status'
  }, {
    text: '▶ Run',
    cb: 'run'
  }, {
    text: '🗑 Xóa Log',
    cb: 'clear_log'
  }]]);
  return true;
}

