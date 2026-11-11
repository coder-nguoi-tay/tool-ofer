import { BTN_MAIN } from '../state/btn-main.mjs';
import { appGet } from '../app-get.mjs';
import { appPost } from '../app-post.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram close.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleCloseCommand({
  cmd,
  chatId,
  name
}) {
  if (!(name === '/close' || name === '/kill' || name === 'close' || name === 'kill')) return false;
  const slot = parseInt(cmd[1], 10);
  if (!slot) {
    const state = await appGet('/state').catch(() => ({}));
    const sessions = (state.chromeSessions || []).filter(s => !s.isClosed);
    if (!sessions.length) {
      await send(chatId, '⚠️ Hiện không có slot nào đang chạy để tắt.', BTN_MAIN);
      return true;
    }
    const rows = [];
    const killBtns = sessions.map(s => ({
      text: `🛑 Tắt Slot ${s.slot}`,
      cb: `close_slot_${s.slot}`
    }));
    for (let i = 0; i < killBtns.length; i += 2) rows.push(killBtns.slice(i, i + 2));
    rows.push([{
      text: '🌐 DS Slot',
      cb: 'slots'
    }, {
      text: '📊 Status',
      cb: 'status'
    }]);
    await send(chatId, '🛑 <b>Chọn slot muốn tắt:</b>', rows);
    return true;
  }
  const res = await appPost(`/browser/close/${slot}`).catch(e => ({
    error: e.message
  }));
  if (res?.ok) {
    await send(chatId, `🛑 Đã tắt riêng <b>Slot ${slot}</b> thành công (không tự bù slot mới).`, [[{
      text: '🌐 DS Slot',
      cb: 'slots'
    }, {
      text: '📊 Status',
      cb: 'status'
    }]]);
  } else {
    await send(chatId, `❌ Tắt Slot ${slot} thất bại: ${res?.error || 'Không tìm thấy slot'}`, [[{
      text: '🌐 DS Slot',
      cb: 'slots'
    }, {
      text: '📊 Status',
      cb: 'status'
    }]]);
  }
  return true;
}

