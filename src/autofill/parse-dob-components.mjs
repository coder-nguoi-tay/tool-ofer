/**
 * Tách và chuẩn hóa các thành phần của ngày sinh (ngày, tháng, năm).
 * Hỗ trợ các định dạng: M/D/YYYY (8/18/1967), MM/DD/YYYY, YYYY-MM-DD, DD/MM/YYYY.
 *
 * @param {string} dobStr Chuỗi ngày sinh từ dữ liệu người dùng.
 * @return {object|null} Đối tượng chứa các định dạng ngày/tháng/năm hoặc null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function parseDobComponents(dobStr) {
  const str = String(dobStr ?? '').trim();
  if (!str) return null;
  let month = null;
  let day = null;
  let year = null;

  // 1. ISO YYYY-MM-DD hoặc YYYY/MM/DD
  let match = str.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (match) {
    year = match[1];
    month = match[2];
    day = match[3];
  } else {
    // 2. M/D/YYYY hoặc MM/DD/YYYY hoặc D/M/YYYY (e.g. 8/18/1967)
    match = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
    if (match) {
      const p1 = Number(match[1]);
      const p2 = Number(match[2]);
      year = match[3];
      // Nếu p1 > 12 thì p1 chắc chắn là ngày (DD/MM/YYYY)
      if (p1 > 12 && p2 <= 12) {
        day = String(p1);
        month = String(p2);
      } else {
        // Mặc định chuẩn US MM/DD/YYYY (8/18/1967 -> tháng 8, ngày 18)
        month = String(p1);
        day = String(p2);
      }
    } else {
      // 3. Chỉ có năm 4 chữ số
      match = str.match(/(\d{4})/);
      if (match) {
        year = match[1];
      }
    }
  }
  if (!year && !month && !day) return null;
  const monthNum = month ? Number(month) : null;
  const dayNum = day ? Number(day) : null;
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const shortMonthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthStr = monthNum ? String(monthNum) : '';
  const monthPad = monthNum ? String(monthNum).padStart(2, '0') : '';
  const monthName = monthNum && monthNames[monthNum] ? monthNames[monthNum] : '';
  const shortMonth = monthNum && shortMonthNames[monthNum] ? shortMonthNames[monthNum] : '';
  const dayStr = dayNum ? String(dayNum) : '';
  const dayPad = dayNum ? String(dayNum).padStart(2, '0') : '';
  const fullYear = year ? String(year) : '';
  const shortYear = year && year.length === 4 ? year.slice(-2) : '';

  // Định dạng US đầy đủ: MM/DD/YYYY (ví dụ: 08/18/1967)
  const usDob = monthPad && dayPad && fullYear ? `${monthPad}/${dayPad}/${fullYear}` : str;
  // Định dạng ISO: YYYY-MM-DD (dành riêng cho HTML5 <input type="date">)
  const isoDob = fullYear && monthPad && dayPad ? `${fullYear}-${monthPad}-${dayPad}` : '';
  return {
    year: fullYear,
    shortYear,
    month: monthStr,
    monthPad,
    monthName,
    shortMonth,
    day: dayStr,
    dayPad,
    usDob,
    isoDob
  };
}
export { parseDobComponents };
