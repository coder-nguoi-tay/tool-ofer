/**
 * So sánh hai số phiên bản Chrome dạng 150.0.1234.56.
 *
 * @param {string} left Phiên bản thứ nhất.
 * @param {string} right Phiên bản thứ hai.
 * @return {number} Số âm, 0 hoặc dương khi left nhỏ hơn, bằng hoặc lớn hơn right.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function compareChromeVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}
export { compareChromeVersions };
