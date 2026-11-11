/**
 * Trộn danh sách bằng Fisher–Yates rồi lấy đúng số lượng có thể chọn.
 * @param {Array<object>} items Các đáp án hợp lệ.
 * @param {number} [count=2] Số đáp án cần chọn.
 * @param {Function} [random=Math.random] Nguồn ngẫu nhiên trong khoảng [0, 1).
 * @return {Array<object>} Danh sách mới, không thay đổi thứ tự danh sách đầu vào.
 */
export function pickRandomCheckboxItems(items, count = 2, random = Math.random) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled.slice(0, Math.min(shuffled.length, Math.max(0, Math.trunc(count))));
}
