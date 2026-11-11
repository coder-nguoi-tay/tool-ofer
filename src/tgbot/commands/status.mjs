import { BTN_RUNNING } from '../state/btn-running.mjs';
import { BTN_STOPPED } from '../state/btn-stopped.mjs';
import { appGet } from '../app-get.mjs';
import { moduleState } from '../state/module-state.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram status.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleStatusCommand({
  chatId,
  name
}) {
  if (!(name === '/status' || name === 'status')) return false;
  const [state, pq, eq] = await Promise.all([appGet('/state'), appGet('/proxy-queue'), appGet('/email-queue')]);
  const running = state.enabled && !state.stopRequested;
  const elapsed = Math.max(1, Math.round((Date.now() - moduleState.botStartTime) / 60000));
  const leads = state.limitRun?.count ?? 0;
  const speed = Math.round((leads - moduleState.sessionLeadsAtBotStart) / elapsed * 60);
  const toffersPoint = state.toffers?.point ?? '--';
  const toffersLeads = state.toffers?.leadCount ?? 0;
  await send(chatId, `<b>📊 Trạng thái</b>\n` + `💎 <b>Tổng Point: ${toffersPoint} pt</b> (${toffersLeads} leads)\n` + `▶ Luồng: ${state.activeCount}/${state.targetCount} ${running ? '🟢' : '🔴'}\n` + `📦 Proxy: ${pq.available} còn / ${pq.used} dùng\n` + `📧 Email: ${eq.available} còn / ${eq.used} dùng\n` + `✅ Leads máy: ${leads}${state.limitRun?.max > 0 ? '/' + state.limitRun.max : ''}\n` + `⚡ Tốc độ: ~${speed} leads/giờ\n` + `💬 ${state.message || ''}`, running ? BTN_RUNNING : BTN_STOPPED);
  return true;
}

