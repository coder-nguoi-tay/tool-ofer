import { isOffer2615, isOffer2615Configured } from './match-offer.mjs';
import { clickPathThankyouButton } from './click-path-thankyou.mjs';
import { verifyOffer2615Landing } from './verify-offer-landing.mjs';

/**
 * Xử lý các bước tiền quét đặc thù của Offer 2615 (FinancialHelpFinder / paththankyou).
 *
 * @param {object} page Tab đang quét.
 * @param {object} context Dữ liệu phiên và cấu hình { session, options, record, ... }.
 * @return {Promise<boolean>} True nếu offer 2615 đã xử lý xong bước hiện tại trên tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export async function handleOffer2615PreScan(page, context = {}) {
  const { session = {}, options = {} } = context;

  // 1. Kiểm tra xác thực link offer mở ra: nếu không phải blog.financialhelpfinder.com thì đóng tất cả trình duyệt
  if (await verifyOffer2615Landing(page, session, options)) {
    return true;
  }

  // 2. Xử lý trang trung gian paththankyou.php (bấm nút "Return to Financial Help Finder")
  if (await clickPathThankyouButton(page, session, options)) {
    return true;
  }

  return false;
}

export {
  isOffer2615,
  isOffer2615Configured,
  clickPathThankyouButton,
  verifyOffer2615Landing
};
