import { BTN_MAIN } from '../state/btn-main.mjs';
import { appGet } from '../app-get.mjs';
import { appPost } from '../app-post.mjs';
import { send } from '../send.mjs';

/**
 * Xử lý lệnh Telegram buy.
 * @param {object} context Người gửi, nội dung và tham số lệnh đã phân tích.
 * @return {Promise<boolean>} True khi lệnh đã được xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function handleBuyCommand({
  chatId,
  name
}) {
  if (!(name === '/buy' || name === 'buy')) return false;
  const ar = await appGet('/711proxy/autorefill');
  if (!ar || ar.error) {
    await send(chatId, '⚠️ Chưa cấu hình 711proxy auto-refill.', BTN_MAIN);
    return true;
  }
  const res = await appPost('/711proxy/generate', {
    count: ar.count ?? 50,
    region: ar.region ?? 'US',
    sessTime: ar.sessTime ?? 20,
    sessAuto: ar.sessAuto ?? false
  });
  const added = res.added ?? res.proxyCount ?? '?';
  await send(chatId, `🛒 Đã mua <b>${added} proxy</b> từ 711proxy.`, [[{
    text: '📦 Xem proxy',
    cb: 'proxy'
  }, {
    text: '📊 Status',
    cb: 'status'
  }]]);
  return true;
}

