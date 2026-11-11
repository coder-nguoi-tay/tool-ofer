/**
 * Gmail chỉ cho tên 6–30 ký tự gồm chữ, số, dấu chấm (không tính phần +tag). File nguồn có nhiều dòng rác
 * như "l@gmail.com", "work@gmail.com", "khmai,g@gmail.com", tên dính mã UUID — form báo email không hợp lệ.
 * Domain khác Gmail thì không kiểm tra thêm.
 *
 * @param {string} email Email cần kiểm tra.
 * @return {boolean} False khi là địa chỉ Gmail không thể tồn tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function isPlausibleGmail(email) {
  const [local = '', domain = ''] = String(email).toLowerCase().split('@');
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return true;
  const name = local.split('+')[0];
  const letters = name.replace(/\./g, '');
  return /^[a-z0-9](?:[a-z0-9.]*[a-z0-9])?$/.test(name) && !name.includes('..') && letters.length >= 6 && letters.length <= 30;
}
export { isPlausibleGmail };
