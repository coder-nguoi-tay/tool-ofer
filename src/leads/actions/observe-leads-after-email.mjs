import { normalizeIpAddress } from '../../lead-check/normalize-ip-address.mjs';
import { protectConfirmedLeadSession } from './protect-confirmed-lead-session.mjs';
import { activeBrowsers } from '../../browser/sessions.mjs';
import { isLeadPresent } from '../../lead-check/is-lead-present.mjs';
import { tgNotify } from '../../../tgbot.mjs';

export const LEAD_OBSERVE_WINDOW_MS = 600_000;

// Phiên đang theo dõi, kể cả khi trình duyệt đã đóng: luồng không tick Check Lead thường
// tự đóng ở thankyou trước khi lead về.
const watched = new Set();

/**
 * Theo dõi lead cho phiên KHÔNG tick Check Lead, từ lúc nhập email, bằng kết quả poll toffers nền.
 * Chỉ hiển thị + ghi log + báo Telegram: không tạm dừng autofill, không đóng trình duyệt,
 * không ghi thống kê lead; khi thấy lead thì khóa bảo vệ đúng IP mà không bật chế độ chờ.
 *
 * @param {{success?: boolean, results?: object[], error?: string}} overview Kết quả refreshToffersOverview.
 * @param {{sessions?: Iterable<object>, now?: number, notify?: (text: string) => unknown}} [options] Nguồn phiên, mốc thời gian, hàm báo.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function observeLeadsAfterEmail(overview, { sessions = activeBrowsers, now = Date.now(), notify = tgNotify } = {}) {
  for (const session of sessions) {
    if (session.enableLeadCheck !== false || !session.emailFilled || !session.exitIp || session.leadObserveSince !== undefined) continue;
    session.leadObserveSince = now;
    watched.add(session);
  }
  for (const session of watched) {
    if (overview?.success && isLeadPresent(overview, session.exitIp)) {
      watched.delete(session);
      session.leadObserveStatus = 'found';
      session.confirmedLeadIp = normalizeIpAddress(session.exitIp);
      protectConfirmedLeadSession(session);
      session.leadObserveMessage = `✅ Có lead cho IP ${session.exitIp}`;
      session.addBrowserLog?.({ type: 'lead_observed', ip: session.exitIp, detail: `Có lead cho IP ${session.exitIp} (theo dõi sau khi nhập email, không tick Check Lead).` });
      void Promise.resolve(notify(`🎉 <b>CÓ LEAD</b> (không tick Check Lead)\n🌐 IP: <code>${session.exitIp}</code>\n🏷️ Offer: ${session.offerNumber ?? session.streamRole ?? 1}`)).catch(() => {});
    } else if (now - session.leadObserveSince >= LEAD_OBSERVE_WINDOW_MS) {
      watched.delete(session);
      session.leadObserveStatus = 'not_found';
      session.leadObserveMessage = `Chưa thấy lead cho IP ${session.exitIp} sau ${LEAD_OBSERVE_WINDOW_MS / 60_000} phút`;
      session.addBrowserLog?.({ type: 'lead_observe_not_found', ip: session.exitIp, detail: session.leadObserveMessage });
    } else if (!overview?.success) {
      session.leadObserveStatus = 'api_error';
      session.leadObserveMessage = `⚠️ API lead lỗi, đang thử lại${overview?.error ? `: ${overview.error}` : ''}`;
    } else {
      session.leadObserveStatus = 'waiting';
      session.leadObserveMessage = '⏳ Đang chờ lead';
    }
  }
}
