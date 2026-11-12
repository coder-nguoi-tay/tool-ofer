/**
 * Báo một lần khi phiên tự động chưa có lead không ghi nhận hoạt động trong năm phút.
 * Chỉ cảnh báo, không đóng phiên; bỏ qua phiên thủ công, skip, đang kiểm tra lead hoặc được giữ để kiểm tay.
 * @param {object} session Phiên chưa có lead do watcher quản lý.
 * @param {object} tracker Mốc bắt đầu và mốc hoạt động đã cảnh báo của watcher.
 * @param {number} [now=Date.now()] Thời điểm kiểm tra.
 * @return {boolean} True khi vừa ghi một cảnh báo mới.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function warnIdleOfferSession(session, tracker, now = Date.now()) {
  if (session.isClosed || session.keepOpenAfterLeadCheck || session.leadCheckStatus === 'checking' || ['manual', 'skip'].includes(session.offerMode)) return false;
  // @deprecated _uxLastActionAt: chỉ đọc dự phòng; mốc hoạt động duy nhất là lastActionTime.
  const lastActivityAt = Math.max(tracker.startedAt, session.lastActionTime ?? session._uxLastActionAt ?? 0);
  if (now - lastActivityAt < 300_000 || tracker.warnedActivityAt === lastActivityAt) return false;
  tracker.warnedActivityAt = lastActivityAt;
  session.addBrowserLog?.({
    type: 'offer_session_idle',
    detail: 'Phiên chưa có lead không ghi nhận hoạt động trong 5 phút; giữ trình duyệt để kiểm tra nguyên nhân.',
  });
  return true;
}
