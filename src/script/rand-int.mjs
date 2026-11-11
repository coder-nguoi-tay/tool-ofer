/**
 * Rand int.
 * @param {*} min min.
 * @param {*} max max.
 * @return {*} Kết quả xử lý rand int.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export { randInt };
