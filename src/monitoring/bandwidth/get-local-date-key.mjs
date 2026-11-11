/**
 * Tạo khóa ngày thống kê theo múi giờ trên máy.
 * @param {Date} d Ngày cần định dạng.
 * @return {string} Kết quả xử lý nghiệp vụ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getLocalDateKey(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export { getLocalDateKey };
