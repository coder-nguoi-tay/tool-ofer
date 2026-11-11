import { randInt } from './rand-int.mjs';

/**
 * Phân tích "min|max" hoặc số cố định thành ms.
 * @param {*} val val.
 * @return {*} Kết quả xử lý parse delay ms.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function parseDelayMs(val) {
  const parts = String(val).split('|');
  const a = Math.max(0, parseFloat(parts[0]) || 0);
  const b = parts[1] != null ? Math.max(0, parseFloat(parts[1]) || 0) : a;
  return a <= b ? randInt(a * 1000, b * 1000) : randInt(b * 1000, a * 1000);
}
export { parseDelayMs };
