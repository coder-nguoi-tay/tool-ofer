import { NON_OFFER_WAIT_MS } from '../../runtime/constants/non-offer-wait-ms.mjs';
import { detectOfferContentInPage } from './detect-offer-content-in-page.mjs';
import { readEvidenceWithTimeout } from '../../logging/recorder/read-evidence-with-timeout.mjs';

/**
 * Nhận diện trang trắng hoặc chỉ có một dòng ngắn sau thời gian chờ; không phân loại non-offer nói chung.
 * @param {object} page Tab cần kiểm tra.
 * @param {{key?: string, since?: number}} tracker Mốc bắt đầu của tài liệu hiện tại.
 * @return {Promise<string|null>} Lý do đóng hoặc null nếu cần giữ/chờ thêm.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function getEmptyOfferPageReason(page, tracker, { subTab = false } = {}) {
  if (!page || page.isClosed?.() || page._aiAssistRunning || page._aiFormFixing || page._leadRecoveryInProgress) return null;
  if (page._lateProgressRecoveryActive) { tracker.since = Date.now(); return null; }
  const url = page.url?.() || '';
  if (/api\.ipify\.org|toffers\.top|adtrapper|adswapper/i.test(url)) return null;
  let key = url;
  try {
    const parsed = new URL(url);
    if (/^https?:$/.test(parsed.protocol)) key = parsed.origin + parsed.pathname;
  } catch {}
  if (key !== tracker.key) {
    tracker.key = key;
    tracker.since = Date.now();
  }
  const waited = Date.now() - tracker.since;
  if (!url || url === 'about:blank') return waited >= NON_OFFER_WAIT_MS.blank ? 'Trang trắng (about:blank) không tải offer' : null;
  if (!/^https?:\/\//i.test(url) || waited < NON_OFFER_WAIT_MS.blank) return null;

  const frames = typeof page.frames === 'function' ? page.frames() : [page];
  if (!frames.length) return null;
  const results = await Promise.all(frames.map(frame => readEvidenceWithTimeout(frame, 'empty-offer-page', () => frame.evaluate(detectOfferContentInPage)).catch(() => null)));
  if (results.some(result => !result)) return null;
  if (results.some(result => result.loading || result.challenge || result.worked || result.hasForm || result.hasChoices)) {
    tracker.since = Date.now();
    return null;
  }
  const mainFrame = typeof page.mainFrame === 'function' ? page.mainFrame() : null;
  const mainIndex = Math.max(0, frames.indexOf(mainFrame));
  const main = results[mainIndex];
  if (main.empty) return 'Trang trắng không có nội dung offer';
  if (main.singleLine && waited >= NON_OFFER_WAIT_MS.noForm) return 'Trang chỉ có một dòng nội dung, không có form/đáp án';
  // Tab thứ 2 trở đi (quy tắc 2026-11-13): không có form/câu hỏi ở frame nào sau 30s thì không phải offer để làm → đóng.
  if (subTab && waited >= NON_OFFER_WAIT_MS.noForm) return 'Tab phụ không có form/câu hỏi để làm';
  return null;
}
