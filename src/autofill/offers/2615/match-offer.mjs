/**
 * Kiểm tra xem phiên có được cấu hình để chạy Offer 2615 hay không
 * (thông qua lựa chọn cách giải 2615, offerId 2615, hoặc websiteUrl chứa offer_id=2615/financialhelpfinder).
 *
 * @param {object} [session={}] Phiên hiện tại.
 * @return {boolean} True nếu phiên được cấu hình cho Offer 2615.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export function isOffer2615Configured(session = {}) {
  if (session?.offerSolver === 'generic') return false;
  if (session?.offerSolver === '2615') return true;

  const websiteUrl = session?.websiteUrl || '';
  if (/[?&]offer_id=2615\b/i.test(websiteUrl)) return true;
  if (session?.offerId === '2615' || session?.offerId === 2615) return true;

  try {
    const parsed = new URL(websiteUrl);
    if (['financialhelpfinder.com', 'www.financialhelpfinder.com', 'blog.financialhelpfinder.com'].includes(parsed.hostname)) {
      return true;
    }
  } catch {}

  return false;
}

/**
 * Kiểm tra xem session hoặc URL của trang có thuộc về Offer 2615 (FinancialHelpFinder) hay không.
 *
 * @param {object} [page] Tab đang quét hoặc URL.
 * @param {object} [session={}] Phiên hiện tại.
 * @return {boolean} True nếu khớp Offer 2615.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export function isOffer2615(page, session = {}) {
  if (session?.offerSolver === 'generic') return false;
  if (session?.offerSolver === '2615') return true;

  // 1. Kiểm tra từ cấu hình session / websiteUrl ban đầu
  if (isOffer2615Configured(session)) return true;

  // 2. Kiểm tra từ URL hiện tại của trang
  const currentUrl = typeof page?.url === 'function' ? page.url() : (typeof page === 'string' ? page : '');
  if (!currentUrl) return false;
  try {
    const parsed = new URL(currentUrl);
    if (['financialhelpfinder.com', 'www.financialhelpfinder.com', 'blog.financialhelpfinder.com'].includes(parsed.hostname)) {
      return true;
    }
  } catch {}

  return false;
}
