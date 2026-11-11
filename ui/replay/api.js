/**
 * Gọi API xem lại và đưa lỗi ra giao diện để người dùng biết dữ liệu chưa được tải/lưu.
 * @param {string} path Tuyến API cần gọi.
 * @param {object} options Tùy chọn fetch.
 * @return {Promise<object>} Nội dung JSON thành công.
 * @throws {Error} Khi máy chủ trả lỗi hoặc mất kết nối.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export async function replayApi(path, options = {}) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}
