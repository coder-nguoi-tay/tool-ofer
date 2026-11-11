import { appGet } from '../app-get.mjs';
import { moduleState } from '../state/module-state.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram speed.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleSpeedCommand({
  chatId,
  name
}) {
  if (!(name === '/speed' || name === 'speed')) return false;
  const state = await appGet('/state');
  const leads = state.limitRun?.count ?? 0;
  const elapsed = Math.max(1, Math.round((Date.now() - moduleState.botStartTime) / 60000));
  const speed = Math.round((leads - moduleState.sessionLeadsAtBotStart) / elapsed * 60);
  await send(chatId, `⚡ ~<b>${speed} leads/giờ</b>\n(${leads - moduleState.sessionLeadsAtBotStart} leads trong ${elapsed} phút)`, [[{
    text: '✅ Leads',
    cb: 'done'
  }, {
    text: '📊 Status',
    cb: 'status'
  }]]);
  return true;
}

