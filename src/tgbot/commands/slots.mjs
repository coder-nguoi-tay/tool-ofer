import { appGet } from '../app-get.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram slots.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleSlotsCommand({
  chatId,
  name
}) {
  if (!(name === '/slots' || name === '/browsers' || name === 'slots' || name === 'browsers')) return false;
  const state = await appGet('/state').catch(() => ({}));
  const sessions = (state.chromeSessions || []).filter(s => !s.isClosed);
  if (!sessions.length) {
    await send(chatId, '🌐 <b>Danh sách Slot</b>: Hiện không có trình duyệt nào đang chạy.', [[{
      text: '▶ Run',
      cb: 'run'
    }, {
      text: '📊 Status',
      cb: 'status'
    }]]);
    return true;
  }
  let text = `🌐 <b>Danh sách Trình duyệt đang chạy (${sessions.length}/${state.targetCount || sessions.length}):</b>\n\n`;
  for (const s of sessions) {
    const urlText = (s.websiteUrl || s.tabs?.[0]?.url || 'N/A').slice(0, 50);
    text += `• <b>Slot ${s.slot}</b> [<code>${s.exitIp || 'Local'}</code>] (${s.deviceVersion || s.deviceProfile || 'Chrome'})\n`;
    text += `  ├ 🔗 <i>${urlText}</i>\n`;
    text += `  ├ 📶 Băng thông: <b>${s.bandwidthFormatted || '0 B'}</b> (${s.requestCount || 0} reqs)\n`;
    text += `  └ ⚡ ${s.action || 'Running'} (Trang ${s.currentScreen ?? 1})\n\n`;
  }
  const rows = [];
  const snapBtns = sessions.map(s => ({
    text: `📺 Chụp S${s.slot}`,
    cb: `screen_${s.slot}`
  }));
  for (let i = 0; i < snapBtns.length; i += 3) rows.push(snapBtns.slice(i, i + 3));
  const killBtns = sessions.map(s => ({
    text: `🛑 Tắt S${s.slot}`,
    cb: `close_slot_${s.slot}`
  }));
  for (let i = 0; i < killBtns.length; i += 3) rows.push(killBtns.slice(i, i + 3));
  rows.push([{
    text: '📶 Băng thông',
    cb: 'bw'
  }, {
    text: '📊 Status',
    cb: 'status'
  }, {
    text: '🛑 Dừng tất cả',
    cb: 'stop'
  }]);
  await send(chatId, text, rows);
  return true;
}

