/**
 * Trang trung gian blog.financialhelpfinder.com/paththankyou.php (cuối chuỗi khảo sát path1*.php): CHƯA xong, còn nút
 * chuyển tiếp ("Return to Financial Help Finder", a.thankyou-button) để autofill bấm sang financialhelpfinder.com.
 * Không phải trang hoàn tất: không áp luật thank-you chung lẫn hoàn tất FinancialHelpFinder (chỉ thankyou.php mới là xong).
 * @param {string} value URL của tab.
 * @return {boolean} True với đúng HTTPS blog.financialhelpfinder.com/paththankyou.php (cho phép query).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function isFinancialhelpPathThankyouUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'blog.financialhelpfinder.com' && url.pathname === '/paththankyou.php';
  } catch {
    return false;
  }
}
