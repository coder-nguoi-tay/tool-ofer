/**
 * Kiểm tra xem URL có phải trang cảm ơn / hoàn tất luồng offer hay không (vd thankyou.php).
 *
 * @param {string} url Địa chỉ trang cần kiểm tra.
 * @return {boolean} True nếu là trang cảm ơn (thankyou.php, thank_you.php, thanks, confirmation).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function isThankYouUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return /thank[-_]?you(\.php|\.html|\/|\?|$)|thanks(\.php|\.html|\/|\?|$)|confirmation(\.php|\.html|\/|\?|$)/i.test(url);
}
