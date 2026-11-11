import { appGet } from '../app-get.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram point.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handlePointCommand({
  chatId,
  name
}) {
  if (!(name === '/point' || name === '/points' || name === 'point' || name === 'points')) return false;
  const state = await appGet('/state').catch(() => ({}));
  const toffers = state.toffers || {};
  const pt = toffers.point ?? '--';
  const leads = toffers.leadCount ?? 0;
  const tunnel = await appGet('/tunnel').catch(() => null);
  const miniUrl = `${tunnel?.url || 'https://duc.taile3f032.ts.net'}/screen-mini`;
  await send(chatId, `💎 <b>TỔNG POINT TOFFERS: ${pt} pt</b>\n` + `🎯 Tổng Leads ghi nhận: <b>${leads} leads</b>\n` + `🕒 Cập nhật: ${toffers.updatedAt ? new Date(toffers.updatedAt).toLocaleTimeString('vi-VN') : 'vừa xong'}\n\n` + `Bấm nút bên dưới để mở Mini App xem danh sách chi tiết:`, [[{
    text: '📱 Xem Chi Tiết Mini App',
    web_app: {
      url: miniUrl
    }
  }]]);
  return true;
}

