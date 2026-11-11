import { tgPost } from './tg-post.mjs';

/**
 * Answer callback.
 * @param {*} id id.
 * @param {string} text text.
 * @return {Promise<void>} Kết quả xử lý answer callback.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function answerCallback(id, text = '') {
  await tgPost('answerCallbackQuery', {
    callback_query_id: id,
    text
  }).catch(() => {});
}
export { answerCallback };
