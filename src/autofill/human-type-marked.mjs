import { humanTypeCore } from './human-type-core.mjs';

/**
 * Human type marked.
 * @param {*} field field.
 * @param {string} text text.
 * @param {object} page page.
 * @param {object} options options.
 * @return {Promise<*>} Kết quả xử lý human type marked.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function humanTypeMarked(field, text, page = null, options = {}) {
  let marked = false;
  try {
    await field?.evaluate?.(el => {
      el.dataset.uxTyping = String(Date.now());
    });
    marked = true;
  } catch {}
  try {
    return await humanTypeCore(field, text, page, options);
  } finally {
    if (marked) {
      try {
        await field?.evaluate?.(el => {
          el.removeAttribute('data-ux-typing');
        });
      } catch {}
    }
  }
}
export { humanTypeMarked };
