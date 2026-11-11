import { appGet } from '../app-get.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram done.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleDoneCommand({
  chatId,
  name
}) {
  if (!(name === '/done' || name === 'done')) return false;
  const state = await appGet('/state');
  const c = state.limitRun?.count ?? 0,
    m = state.limitRun?.max ?? 0;
  await send(chatId, `✅ Leads: <b>${c}</b>${m > 0 ? `/${m}` : ''}`, [[{
    text: '⚡ Speed',
    cb: 'speed'
  }, {
    text: '📊 Status',
    cb: 'status'
  }]]);
  return true;
}

