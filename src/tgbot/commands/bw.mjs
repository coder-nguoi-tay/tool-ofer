import { appGet } from '../app-get.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram bw.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleBwCommand({
  chatId,
  name
}) {
  if (!(name === '/bw' || name === '/bandwidth' || name === 'bw' || name === 'bandwidth')) return false;
  const [state, cons] = await Promise.all([appGet('/state').catch(() => ({})), appGet('/711proxy/consumption?days=1').catch(() => ({}))]);
  const bw = state.bandwidth || {};
  const today = bw.today || {};
  const p711 = bw.proxy711 || {};
  const sessions = (state.chromeSessions || []).filter(s => !s.isClosed);
  let text = `<b>📶 Thống kê Băng thông & 711Proxy</b>\n\n`;

  // 1. Thống kê app đo hôm nay
  text += `<b>📊 Hôm nay (App đo):</b>\n`;
  text += `• Tổng tiêu hao: <b>${today.formatted || '0 B'}</b> (${today.requestCount?.toLocaleString('vi-VN') || 0} reqs)\n`;
  text += `• Tải về: ⬇️ <b>${today.receivedFormatted || '0 B'}</b> | Tải lên: ⬆️ <b>${today.sentFormatted || '0 B'}</b>\n\n`;

  // 2. Data 711Proxy từ Web API
  text += `<b>🌐 711Proxy (Web API):</b>\n`;
  if (p711.ok) {
    text += `• Gói dung lượng: <b>${p711.packageFormatted || p711.packageGb + ' GB'}</b>\n`;
    text += `• Còn lại: <b>${p711.remainingFormatted || p711.remainingGb + ' GB'}</b> (${p711.remainingPercent ?? 0}%)\n`;
    text += `• Đã dùng: <b>${p711.usedFormatted || p711.usedGb + ' GB'}</b> (${p711.usedPercent ?? 0}%)\n`;
  } else {
    text += `• Số dư: <i>${p711.error || 'Chưa đồng bộ số dư'}</i>\n`;
  }
  if (cons?.ok) {
    text += `• Web ghi nhận tiêu hao hôm nay: <b>${cons.totalFormatted || '0 B'}</b> (${cons.activeHoursCount || 0} giờ chạy)\n`;
    if (cons.peakHour) {
      text += `• Giờ cao điểm: <b>${cons.peakHour}</b> (${cons.peakFormatted})\n`;
    }
  }
  text += `\n`;

  // 3. Tiêu hao theo các slot đang chạy
  if (sessions.length > 0) {
    text += `<b>🖥 Tiêu hao theo Slot đang chạy:</b>\n`;
    for (const s of sessions) {
      text += `• <b>Slot ${s.slot}</b> [<code>${s.exitIp || 'Local'}</code>]: <b>${s.bandwidthFormatted || '0 B'}</b> (${s.requestCount || 0} reqs)\n`;
    }
  } else {
    text += `<i>(Hiện không có slot nào đang chạy)</i>\n`;
  }
  const buttons = [[{
    text: '📱 Mini App',
    cb: 'app'
  }, {
    text: '🔄 Làm mới',
    cb: 'bw'
  }], [{
    text: '📺 Màn hình',
    cb: 'screen'
  }, {
    text: '🌐 DS Slot',
    cb: 'slots'
  }], [{
    text: '📊 Status',
    cb: 'status'
  }]];
  await send(chatId, text, buttons);
  return true;
}

