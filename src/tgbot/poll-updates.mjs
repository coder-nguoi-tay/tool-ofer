import { execCommand } from './exec-command.mjs';
import { handleCallback } from './handle-callback.mjs';
import { moduleState } from './state/module-state.mjs';
import { tgPost } from './tg-post.mjs';

/**
 * Poll updates.
 * @return {Promise<void>} Kết quả xử lý poll updates.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function pollUpdates() {
  try {
    const data = await tgPost('getUpdates', {
      offset: moduleState.lastUpdateId + 1,
      timeout: 25
    });
    if (!data.ok || !data.result) return;
    for (const upd of data.result) {
      moduleState.lastUpdateId = upd.update_id;
      if (upd.callback_query) {
        const cq = upd.callback_query;
        await handleCallback(cq.message.chat.id, cq.from.id, cq.id, cq.data);
        continue;
      }
      const msg = upd.message;
      if (!msg?.text) continue;
      await execCommand(msg.chat.id, msg.from.id, msg.text.split('@')[0]);
    }
  } catch {
    await new Promise(r => setTimeout(r, 3000));
  }
}
export { pollUpdates };
