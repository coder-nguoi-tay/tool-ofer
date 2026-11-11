import { APP_BASE } from './state/app-base.mjs';

/**
 * App post.
 * @param {string} path path.
 * @param {object} body body.
 * @return {Promise<*>} Kết quả xử lý app post.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function appPost(path, body = {}) {
  const r = await fetch(`${APP_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  return r.json();
}
export { appPost };
