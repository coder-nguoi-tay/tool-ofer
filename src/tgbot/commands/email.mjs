import { appGet } from '../app-get.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram email.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleEmailCommand({
  chatId,
  name
}) {
  if (!(name === '/email' || name === 'email')) return false;
  const eq = await appGet('/email-queue');
  await send(chatId, `<b>📧 Email</b>\nCòn: <b>${eq.available}</b> / Dùng: ${eq.used}`, [[{
    text: '📊 Status',
    cb: 'status'
  }]]);
  return true;
}

