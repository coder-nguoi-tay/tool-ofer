/**
 * Nhận diện chính xác điểm hoàn tất FinancialHelpFinder do người dùng chỉ định.
 * @param {string} value URL hiện tại của tab.
 * @return {boolean} True chỉ với HTTPS financialhelpfinder.com/thankyou.php (cho phép query và www): trang đã xong, tắt
 *   trình duyệt. blog.financialhelpfinder.com/paththankyou.php KHÔNG phải điểm hoàn tất (còn nút chuyển tiếp phải bấm;
 *   xem isFinancialhelpPathThankyouUrl). Đối chiếu HTML thật đã lưu 2026-11-11 và xác nhận của người dùng 2026-11-15.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function isFinancialhelpThankyouUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    return ['financialhelpfinder.com', 'www.financialhelpfinder.com'].includes(url.hostname) && url.pathname === '/thankyou.php';
  } catch { return false; }
}
