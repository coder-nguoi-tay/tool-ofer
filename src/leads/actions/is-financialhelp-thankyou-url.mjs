/**
 * Nhận diện chính xác điểm hoàn tất FinancialHelpFinder do người dùng chỉ định.
 * @param {string} value URL hiện tại của tab.
 * @return {boolean} True với HTTPS financialhelpfinder.com/thankyou.php, cho phép query và www.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function isFinancialhelpThankyouUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['financialhelpfinder.com', 'www.financialhelpfinder.com'].includes(url.hostname) && url.pathname === '/thankyou.php';
  } catch { return false; }
}
