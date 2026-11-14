/**
 * Gọi API cục bộ của tab Cài đặt mini, luôn trả JSON hoặc { error } để UI không bị văng lỗi.
 * @param {string} path Đường dẫn API, ví dụ '/ai/config'.
 * @param {object} [options] Tùy chọn fetch (method, body...).
 * @return {Promise<object>} JSON từ máy chủ hoặc { error } khi mất kết nối.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetApi(path, options = {}) {
  try {
    const res = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
    return (await res.json()) || {};
  } catch (err) {
    return { error: err?.message || 'Không kết nối được máy chủ.' };
  }
}

/**
 * Hiện trạng thái ngắn dưới một khối cài đặt.
 * @param {string} id Id phần tử trạng thái.
 * @param {string} text Nội dung hiển thị.
 * @param {boolean} [ok] true = xanh, false = đỏ, bỏ trống = màu mặc định.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniSetStatus(id, text, ok) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.style.color = ok === undefined ? '#94a3b8' : ok ? '#22c55e' : '#f87171';
}
