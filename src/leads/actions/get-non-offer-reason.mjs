import { NON_OFFER_WAIT_MS } from '../../runtime/constants/non-offer-wait-ms.mjs';
import { detectOfferContentInPage } from './detect-offer-content-in-page.mjs';

/**
 * Nhận diện tab không phải trang offer: offer hết hạn (404offer/unavailable), trang trắng,
 * lỗi HTTP 404/410/5xx, hoặc trang không có form/nút nào để làm. Có câu hỏi, form hoặc dấu vết
 * thao tác thì giữ tab, kể cả khi máy chủ trả trạng thái HTTP lỗi.
 * Việc đóng tab hay đóng cả trình duyệt do watchTrafficBlockedPage quyết định theo tiến triển của phiên.
 *
 * @param {object} page Tab cần xét.
 * @param {{url?: string, since?: number}} tracker Trạng thái theo dõi của tab (URL đang đứng và mốc bắt đầu).
 * @return {Promise<string|null>} Lý do đóng, hoặc null nếu vẫn là trang offer / chưa đủ thời gian.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function getNonOfferReason(page, tracker) {
  if (!page || page.isClosed?.()) return null;
  if (page._lateProgressRecoveryActive) { tracker.since = Date.now(); return null; }
  const url = page.url?.() || '';
  // Đồng hồ theo trang (origin + path): trang quảng cáo đổi query/#hash liên tục không được reset thời gian chờ.
  let key = url;
  try {
    const parsed = new URL(url);
    if (/^https?:$/.test(parsed.protocol)) key = parsed.origin + parsed.pathname;
  } catch {}
  tracker.url = url;
  if (key !== tracker.key) {
    tracker.key = key;
    tracker.since = Date.now();
  }
  const waited = Date.now() - tracker.since;
  if (/404offer\.com|\/\/unavailable\./i.test(url)) return 'Offer hết hạn (trang unavailable)';
  // Trang trung gian của luồng click/kiểm tra IP: không phải offer nhưng tự chuyển tiếp.
  if (/api\.ipify\.org|toffers\.top|adtrapper|adswapper/i.test(url)) return null;
  if (!url || url === 'about:blank') return waited >= NON_OFFER_WAIT_MS.blank ? 'Trang trắng (about:blank) không tải offer' : null;
  const status = page._uxMainStatus;
  const isHttpError = [404, 410, 500, 502, 504].includes(status);
  if (isHttpError && waited < NON_OFFER_WAIT_MS.httpError) return null;
  if (!isHttpError && waited < NON_OFFER_WAIT_MS.noForm) return null;
  // Xét cả iframe: form offer hay nằm trong iframe. Chỉ cần một frame có form/đáp án là giữ tab.
  const frames = typeof page.frames === 'function' ? page.frames() : [page];
  const results = await Promise.all(frames.map(f => f.evaluate(detectOfferContentInPage).catch(() => null)));
  const found = results.filter(Boolean);
  if (found.length === 0) return null; // không đọc được trang: không đóng nhầm
  if (found.some(r => r.challenge || r.worked || r.hasForm || r.hasChoices)) {
    // Giữ trang có câu hỏi/form kể cả HTTP lỗi; SPA cùng path có thể loading ngắn giữa hai bước.
    tracker.since = Date.now();
    return null;
  }
  if (isHttpError) return `Trang lỗi HTTP ${status}`;
  return 'Trang không có form nhập / đáp án để chọn';
}
