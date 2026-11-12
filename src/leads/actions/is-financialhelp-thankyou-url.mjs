/**
 * Nhận diện chính xác điểm hoàn tất FinancialHelpFinder do người dùng chỉ định.
 * @param {string} value URL hiện tại của tab.
 * @return {boolean} True với HTTPS financialhelpfinder.com/thankyou.php (cho phép query và www) và
 *   blog.financialhelpfinder.com/paththankyou.php (cuối chuỗi khảo sát path1*.php, thêm 2026-11-12).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function isFinancialhelpThankyouUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    if (['financialhelpfinder.com', 'www.financialhelpfinder.com'].includes(url.hostname)) return url.pathname === '/thankyou.php';
    // Cuối chuỗi khảo sát path1*.php của blog: trước đây rơi vào luật thankyou chung và bị đóng ~1s sau khi tải
    // (log 2026-11-12, 2 phiên đều không có lead) — đi qua kiểm tra hoàn tất ổn định 3s của financialhelp.
    return url.hostname === 'blog.financialhelpfinder.com' && url.pathname === '/paththankyou.php';
  } catch { return false; }
}
