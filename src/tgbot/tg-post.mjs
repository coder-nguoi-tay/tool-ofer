import { moduleState } from './state/module-state.mjs';

/**
 * Tg post.
 * @param {*} method method.
 * @param {object} body body.
 * @return {Promise<*>} Kết quả xử lý tg post.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function tgPost(method, body = {}) {
  const r = await fetch(`https://api.telegram.org/bot${moduleState.cfg.botToken}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return r.json();
}
export { tgPost };
