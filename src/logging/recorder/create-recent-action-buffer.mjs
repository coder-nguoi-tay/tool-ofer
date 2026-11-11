/**
 * Giữ tối đa 100 thao tác trong 60 giây gần nhất cho từng tab, không ghi file hay giữ Page đã giải phóng.
 * @return {object} Hàm push và read dùng để gắn ngữ cảnh vào lỗi mới.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function createRecentActionBuffer() {
  const pages = new WeakMap();
  /**
   * Giữ thao tác đã giới hạn dữ liệu trong bộ đệm tab.
   * @param {object} page Tab nguồn.
   * @param {object} action Thao tác không chứa giá trị nhập.
   * @return {void} Loại thao tác quá cũ hoặc vượt trần khỏi RAM.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  function push(page, action) {
    if (!page) return;
    const recent = pages.get(page) || [];
    recent.push({ at: Date.now(), action });
    while (recent.length > 100 || recent[0]?.at < Date.now() - 60_000) recent.shift();
    pages.set(page, recent);
  }
  /**
   * Lấy bản sao danh sách thao tác còn mới, không mang tham chiếu Page vào log.
   * @param {object|null} page Tab đang có lỗi.
   * @return {object[]} Ngữ cảnh tối đa 100 thao tác trong phút vừa qua.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  function read(page) {
    return (pages.get(page) || []).filter(item => item.at >= Date.now() - 60_000).map(item => item.action);
  }
  return { push, read };
}
