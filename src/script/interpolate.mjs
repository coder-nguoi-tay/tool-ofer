import { buildVars } from './build-vars.mjs';

/**
 * Interpolate.
 * @param {string} text text.
 * @param {object} record record.
 * @return {*} Kết quả xử lý interpolate.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function interpolate(text, record) {
  const vars = buildVars(record);
  return String(text).replace(/\{([^}]+)\}/g, (_, k) => vars[k] ?? '');
}
export { interpolate };
