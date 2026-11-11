import { APP_BASE } from './state/app-base.mjs';

/**
 * App get.
 * @param {string} path path.
 * @return {Promise<*>} Kết quả xử lý app get.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function appGet(path) {
  const r = await fetch(`${APP_BASE}${path}`);
  return r.json();
}
export { appGet };
