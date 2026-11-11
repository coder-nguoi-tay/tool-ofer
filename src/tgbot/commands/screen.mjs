import { APP_BASE } from '../state/app-base.mjs';
import { appGet } from '../app-get.mjs';
import { send } from '../send.mjs';
import { sendPhoto } from '../send-photo.mjs';

/**
 * Xử lý lệnh Telegram screen.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleScreenCommand({
  chatId,
  cmd,
  name
}) {
  if (!(name === '/screen' || name === '/snap' || name === 'screen' || name === 'snap')) return false;
  const state = await appGet('/state').catch(() => ({}));
  const sessions = (state.chromeSessions || []).filter(s => !s.isClosed);
  if (!sessions.length) {
    await send(chatId, '⚠️ <b>Hiện không có slot nào đang chạy</b> để chụp màn hình.\nNhấn ▶ <b>Run</b> để khởi động slot.', [[{
      text: '▶ Run',
      cb: 'run'
    }, {
      text: '📊 Status',
      cb: 'status'
    }]]);
    return true;
  }
  let targetSlot = parseInt(cmd[1], 10);
  if (!targetSlot) {
    if (sessions.length === 1) {
      targetSlot = sessions[0].slot;
    } else {
      const rows = [];
      const slotButtons = sessions.map(s => ({
        text: `📺 Slot ${s.slot} (${s.exitIp || 'Local'})`,
        cb: `screen_${s.slot}`
      }));
      for (let i = 0; i < slotButtons.length; i += 2) {
        rows.push(slotButtons.slice(i, i + 2));
      }
      rows.push([{
        text: '📊 Status',
        cb: 'status'
      }, {
        text: '📶 Băng thông',
        cb: 'bw'
      }]);
      await send(chatId, `📺 <b>Chọn slot muốn chụp màn hình:</b>`, rows);
      return true;
    }
  }
  const session = sessions.find(s => s.slot === targetSlot);
  if (!session) {
    const liveList = sessions.map(s => s.slot).join(', ');
    await send(chatId, `❌ Không tìm thấy <b>Slot ${targetSlot}</b> đang chạy.\nCác slot hiện tại: <b>${liveList}</b>`, [[{
      text: '📺 Chọn Slot khác',
      cb: 'screen'
    }, {
      text: '📊 Status',
      cb: 'status'
    }]]);
    return true;
  }
  try {
    const snapRes = await fetch(`${APP_BASE}/screen/snapshot/${targetSlot}`);
    if (!snapRes.ok) throw new Error(`HTTP ${snapRes.status}`);
    const arrayBuf = await snapRes.arrayBuffer();
    const imgBuffer = Buffer.from(arrayBuf);
    const urlDisplay = (session.websiteUrl || session.tabs?.[0]?.url || 'Chưa mở URL').slice(0, 70);
    const caption = `📺 <b>Màn hình Slot ${targetSlot}</b> (${session.deviceVersion || session.deviceProfile || 'Chrome'})\n` + `🌐 IP: <code>${session.exitIp || 'Local'}</code>\n` + `🔗 URL: <i>${urlDisplay}</i>\n` + `⚡ Trạng thái: ${session.action || 'Running'}\n` + `📶 Tiêu hao: <b>${session.bandwidthFormatted || '0 B'}</b> (${session.requestCount || 0} reqs)\n` + `📄 Trang: ${session.currentScreen ?? 1} | Điền: ${session.autofillFields || 0} ô`;
    const tunnel = await appGet('/tunnel').catch(() => null);
    const screenButtons = [];
    if (tunnel?.url) {
      screenButtons.push([{
        text: `📱 Xem Live Slot ${targetSlot} (Chạm & Gõ)`,
        web_app: {
          url: `${tunnel.url}/screen-mini`
        }
      }]);
    }
    screenButtons.push([{
      text: `🔄 Chụp lại Slot ${targetSlot}`,
      cb: `screen_${targetSlot}`
    }, {
      text: `🛑 Tắt Slot ${targetSlot}`,
      cb: `close_slot_${targetSlot}`
    }]);
    const otherSlots = sessions.filter(s => s.slot !== targetSlot);
    if (otherSlots.length > 0) {
      const otherBtns = otherSlots.slice(0, 3).map(s => ({
        text: `📺 Slot ${s.slot}`,
        cb: `screen_${s.slot}`
      }));
      screenButtons.push(otherBtns);
    }
    screenButtons.push([{
      text: '📶 Băng thông',
      cb: 'bw'
    }, {
      text: '🌐 DS Slot',
      cb: 'slots'
    }, {
      text: '📊 Status',
      cb: 'status'
    }]);
    await sendPhoto(chatId, imgBuffer, caption, screenButtons);
  } catch (snapErr) {
    await send(chatId, `⚠️ Không thể chụp ảnh màn hình Slot ${targetSlot}: ${snapErr.message || 'Lỗi kết nối'}\n(Trình duyệt có thể đang bận chuyển trang hoặc vừa đóng).`, [[{
      text: '🔄 Thử lại',
      cb: `screen_${targetSlot}`
    }, {
      text: '🌐 DS Slot',
      cb: 'slots'
    }]]);
  }
  return true;
}

