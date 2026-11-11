import { NON_OFFER_WAIT_MS } from '../../runtime/constants/non-offer-wait-ms.mjs';

/**
 * Phiên đang làm offer: đang chờ API check lead, hoặc autofill vừa thao tác trong khoảng chờ "không form".
 * Trước đây chỉ cần từng điền/bấm một lần (autofillActions, emailFilled, completedScreens…) là phiên
 * không bao giờ được nhường slot dù tab còn lại đã rời offer; các trạng thái lead đã kết thúc
 * (api_error, unmatched, failed) cũng bị tính là "đang làm".
 *
 * @param {object} session Phiên đang chạy.
 * @param {number} [now=Date.now()] Mốc thời gian hiện tại.
 * @return {boolean} True nếu phải giữ phiên.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function isSessionWorkingOnOffer(session, now = Date.now()) {
  // keepOpenAfterLeadCheck: người dùng tắt "tự đóng khi hết lead" để kiểm tra tay.
  if (session.leadCheckStatus === 'checking' || session.keepOpenAfterLeadCheck === true) return true;
  // lastActionTime được AI và các handler survey/submit ghi; _uxLastActionAt do bộ đếm ghi.
  const last = Math.max(session._uxLastActionAt ?? -Infinity, session.lastActionTime ?? -Infinity);
  return now - last < NON_OFFER_WAIT_MS.noForm;
}
