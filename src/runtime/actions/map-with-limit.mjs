/**
 * Chạy handler trên từng phần tử nhưng không vượt quá mức đồng thời cho trước.
 *
 * @param {Array} items Danh sách phần tử cần xử lý.
 * @param {number} limit Số tác vụ chạy song song tối đa.
 * @param {Function} handler Hàm xử lý một phần tử, nhận (item, index).
 * @return {Promise<Array>} Kết quả theo đúng thứ tự đầu vào.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function mapWithLimit(items, limit, handler) {
  const results = new Array(items.length);
  let nextIndex = 0;
  // ponytail: pool tối giản, đủ cho vài chục dòng proxy; thay bằng thư viện nếu cần hàng nghìn.
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await handler(items[index], index);
    }
  };
  await Promise.all(Array.from({
    length: Math.max(1, Math.min(limit, items.length))
  }, worker));
  return results;
}
