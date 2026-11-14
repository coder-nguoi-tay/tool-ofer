/**
 * Gọi API JSON của app cho tab Tài nguyên: không có body thì GET, có body thì POST JSON.
 * Lỗi mạng / JSON hỏng trả về object `{ error }` để caller chỉ cần kiểm tra một kiểu kết quả.
 * @param {string} url Đường dẫn API, ví dụ `/proxy-queue`.
 * @param {object} [body] Payload POST; truyền `{}` để POST không có dữ liệu.
 * @return {Promise<object>} JSON server trả về hoặc `{ error }`.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResApi(url, body) {
  try {
    const options = body === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
    const res = await fetch(url, options);
    return (await res.json()) || {};
  } catch (err) {
    return { error: err.message || String(err) };
  }
}

/**
 * Lọc dòng trùng trong một textarea (bỏ dòng trống, giữ thứ tự xuất hiện đầu tiên).
 * @param {string} id Id textarea.
 * @param {string} label Tên loại dữ liệu hiển thị trong toast (proxy / email).
 * @param {boolean} [lowerCase=false] So khớp không phân biệt hoa thường (email).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniResDedupeTextarea(id, label, lowerCase = false) {
  const el = document.getElementById(id);
  const lines = el.value.split('\n').map((l) => l.trim()).filter(Boolean);
  const unique = Array.from(new Set(lowerCase ? lines.map((l) => l.toLowerCase()) : lines));
  el.value = unique.join('\n');
  showToast(`Đã lọc trùng ${label}: xoá ${lines.length - unique.length} dòng, còn ${unique.length}.`);
}

/**
 * Trộn ngẫu nhiên thứ tự các dòng trong textarea (Fisher–Yates).
 * @param {string} id Id textarea.
 * @param {string} label Tên loại dữ liệu hiển thị trong toast (proxy / email).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniResShuffleTextarea(id, label) {
  const el = document.getElementById(id);
  const lines = el.value.split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }
  el.value = lines.join('\n');
  showToast(`Đã trộn ngẫu nhiên ${lines.length} ${label}.`);
}
