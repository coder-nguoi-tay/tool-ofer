import { completeFinancialhelpSession } from '../../../../leads/actions/complete-financialhelp-session.mjs';
import { isOffer2615Configured } from '../match-offer.mjs';

/**
 * Luật đóng phiên riêng của offer 2615 (người dùng chốt 2026-11-17: không ăn theo luật đóng phiên của offer khác).
 *
 * Phiên 2615 chỉ được đóng vì:
 * - tới financialhelpfinder.com/thankyou.php và không còn tab offer con (hàm dưới);
 * - các chốt chặn chung không phụ thuộc offer: hết thời gian chạy tối đa, trùng IP toffers, lead không khớp IP,
 *   link mở sai trang đích (verify-offer-landing), trang chết/lỗi mạng khi chưa có lead, kẹt adtrapper.
 *
 * Bộ theo dõi phiên (watch-traffic-blocked-page) KHÔNG áp cho phiên 2615 các luật: thankyou chung (isThankYouUrl),
 * "đã có lead và hết offer con" (finishLeadSessionAfterSubOffers), màn card sweepstakes. Luật chung "lead + hết offer
 * con" từng đóng phiên lead 2615 giữa luồng vì tính popup searchcactus bị chặn là offer con (IP 82.40.67.250).
 * @param {object} session Phiên trình duyệt.
 * @return {boolean} True khi phiên chạy theo luật đóng phiên riêng của 2615.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function usesOffer2615CloseRules(session) {
  return isOffer2615Configured(session);
}

/**
 * Hoàn tất phiên 2615 ở financialhelpfinder.com/thankyou.php khi đã hết tab offer con.
 * @param {object} session Phiên 2615.
 * @param {Function} closeSession Đóng trình duyệt và bù slot (nhận { completedFinancialFlow }).
 * @return {Promise<boolean>} True nếu đã đóng phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
export function finishOffer2615Session(session, closeSession) {
  return completeFinancialhelpSession(session, closeSession);
}
