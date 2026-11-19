import { NON_OFFER_WAIT_MS } from '../../runtime/constants/non-offer-wait-ms.mjs';
import { detectOfferContentInPage } from './detect-offer-content-in-page.mjs';
import { hasOfferWorkEvidence } from './has-offer-work-evidence.mjs';
import { readEvidenceWithTimeout } from '../../logging/recorder/read-evidence-with-timeout.mjs';
import { inspectFormFrameOwner } from '../../browser/frames/inspect-form-frame-owner.mjs';
import { hasPendingFrameRequests, lastFrameRequestSettledAt } from '../../browser/frames/pending-frame-requests.mjs';
import { readSubOfferCloseReason } from './get-sub-offer-close-reason.mjs';

/**
 * Xét trang trắng ở tab chính. Với tab phụ, chỉ tính phần việc còn lại bên trong iframe hợp lệ.
 * @param {object} page Tab cần kiểm tra.
 * @param {{key?: string, since?: number}} tracker Mốc bắt đầu của tài liệu hiện tại.
 * @param {object} options Lựa chọn phân loại tab phụ.
 * @return {Promise<string|null>} Lý do đóng hoặc null nếu cần giữ/chờ thêm.
 * @throws {Error} Khi API tab phát sinh lỗi ngoài quá trình đọc evidence.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function getEmptyOfferPageReason(page, tracker, { subTab = false } = {}) {
  const mainFrame = page?.mainFrame?.();
  if (!page || page.isClosed?.() || page._leadRecoveryInProgress) {
    if (subTab) tracker.since = undefined;
    return null;
  }
  if (subTab && hasPendingFrameRequests(page, mainFrame)) {
    if (hasPendingFrameRequests(page, mainFrame, true)) tracker.since = undefined;
    return null;
  }
  if (!subTab && page._uxSweepstakesCardPageUrl && page._uxSweepstakesCardPageUrl === page.url()) { tracker.since = Date.now(); return null; }
  if (!subTab && (page._lateProgressRecoveryActive || page._aiAssistRunning || page._aiFormFixing)) { tracker.since = Date.now(); return null; }
  const url = page.url?.() || '';
  let key = url;
  try {
    const parsed = new URL(url);
    if (!subTab && /api\.ipify\.org|toffers\.top|adtrapper|adswapper/i.test(url)) return null;
    if (/^https?:$/.test(parsed.protocol)) key = parsed.origin + parsed.pathname;
  } catch {}
  if (key !== tracker.key) {
    tracker.key = key;
    tracker.since = Date.now();
  }
  tracker.since ??= Date.now();
  const waited = Date.now() - tracker.since;
  const blankPage = /^about:blank(?:[?#]|$)/i.test(url);
  if ((!blankPage && !/^https?:\/\//i.test(url)) || !subTab && waited < NON_OFFER_WAIT_MS.blank) return null;

  const frames = typeof page.frames === 'function' ? page.frames() : [page];
  if (subTab && mainFrame && !frames.includes(mainFrame)) {
    tracker.since = undefined;
    return null;
  }
  const mainIndex = Math.max(0, frames.indexOf(mainFrame));
  const inspectedAt = Date.now();
  const results = await Promise.all(frames.map((frame, index) => readEvidenceWithTimeout(frame, 'empty-offer-page', async () => {
    if (subTab && index !== mainIndex) {
      const owner = await inspectFormFrameOwner(frame, { iframeOnly: true });
      if (owner === 'excluded') return { excluded: true };
      if (owner !== 'eligible') return null;
      if (hasPendingFrameRequests(page, frame)) return { pending: true, loading: hasPendingFrameRequests(page, frame, true) };
    }
    const content = await frame.evaluate(detectOfferContentInPage, {
      subTab,
      loadingOnly: subTab && index === mainIndex && !blankPage,
      remainingIframeWork: subTab && index !== mainIndex,
    });
    if (subTab && typeof content?.hasForm !== 'boolean') return null;
    return content;
  }).catch(() => null)));
  const frameAttachedDuringCheck = subTab && page.frames?.().some(frame => !frames.includes(frame));
  if (!results.length || results.some(result => !result) || frameAttachedDuringCheck) {
    if (subTab) tracker.since = undefined;
    return null;
  }
  if (results.some((result, index) => result.loading || result.challenge || (subTab
    ? (index !== mainIndex || blankPage) && (result.hasForm || result.hasChoices || result.hasQuestion)
    : result.worked || hasOfferWorkEvidence(result)))) {
    tracker.since = subTab ? undefined : Date.now();
    return null;
  }
  if (subTab) {
    if (results.some(result => result.pending)) return null;
    // Chỉ đọc thông báo kết thúc sau khi mọi frame liên quan đều đã tải và không còn form/câu hỏi.
    const terminalReason = await readSubOfferCloseReason(page);
    const checkedFrames = frames.filter((frame, index) => !results[index].excluded);
    if (page.frames?.().some(frame => !frames.includes(frame))) {
      tracker.since = undefined;
      return null;
    }
    if (checkedFrames.some(frame => hasPendingFrameRequests(page, frame))) {
      if (checkedFrames.some(frame => hasPendingFrameRequests(page, frame, true))) tracker.since = undefined;
      return null;
    }
    for (const frame of checkedFrames) {
      const settledAt = lastFrameRequestSettledAt(page, frame);
      tracker.since = Math.max(tracker.since, settledAt);
      if (settledAt && settledAt >= inspectedAt) return null;
    }
    if (blankPage) return Date.now() - tracker.since >= NON_OFFER_WAIT_MS.blank ? 'Trang trắng (about:blank) không tải offer' : null;
    return terminalReason || (Date.now() - tracker.since >= NON_OFFER_WAIT_MS.noForm ? 'Tab phụ đã hết form hoặc câu hỏi trong iframe' : null);
  }
  const main = results[mainIndex];
  if (blankPage) return 'Trang trắng (about:blank) không tải offer';
  if (main.empty) return 'Trang trắng không có nội dung offer';
  if (main.singleLine && waited >= NON_OFFER_WAIT_MS.noForm) return 'Trang chỉ có một dòng nội dung, không có form/đáp án';
  return null;
}
