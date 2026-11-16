import { isOffer2615, isOffer2615Configured, handleOffer2615PreScan, verifyOffer2615Landing } from './2615/index.mjs';

/**
 * Điều phối xử lý tiền quét (pre-scan) hoặc các luật riêng theo từng Offer chuyên biệt.
 * Tránh việc nhồi nhét ngoại lệ của từng offer vào pipeline autofill dùng chung.
 * Tôn trọng lựa chọn cách giải (offerSolver): auto | 2615 | generic.
 *
 * @param {object} page Tab đang quét.
 * @param {object} context Dữ liệu phiên và cấu hình { session, options, record, ... }.
 * @return {Promise<boolean>} True nếu offer solver đã xử lý bước này và không cần chạy tiếp generic pipeline.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-16
 */
export async function dispatchOfferCustomPreScan(page, context = {}) {
  const { session = {} } = context;
  const solver = session.offerSolver || 'auto';

  // 1. Nếu người dùng chọn "generic" (Giải chung): bỏ qua các solver riêng, chạy pipeline generic
  if (solver === 'generic') {
    return false;
  }

  // 2. Nếu người dùng ép chọn "2615" HOẶC chọn "auto" và trang khớp Offer 2615:
  if (solver === '2615' || (solver === 'auto' && isOffer2615(page, session))) {
    if (await handleOffer2615PreScan(page, context)) {
      return true;
    }
  }

  return false;
}

export {
  isOffer2615,
  isOffer2615Configured,
  handleOffer2615PreScan,
  verifyOffer2615Landing
};
