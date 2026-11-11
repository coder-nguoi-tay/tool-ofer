/**
 * So sánh hai version bốn số theo từng thành phần.
 *
 * @param {string} left Version bên trái.
 * @param {string} right Version bên phải.
 * @return {number} Số dương khi left mới hơn right.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function comparePatchOrder(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 4; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}
export { comparePatchOrder };
