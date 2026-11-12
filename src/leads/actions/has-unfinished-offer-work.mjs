import { detectOfferContentInPage } from './detect-offer-content-in-page.mjs';
import { readEvidenceWithTimeout } from '../../logging/recorder/read-evidence-with-timeout.mjs';

/**
 * Giữ trang còn form/câu hỏi, đang tải hoặc chưa đọc được DOM; xét cả iframe hiển thị.
 * @param {object} page Tab cần kiểm tra trước khi đóng hoặc giữ lại khi trùng link.
 * @return {Promise<boolean>} True nếu còn việc hoặc chưa đủ bằng chứng để đóng trang.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function hasUnfinishedOfferWork(page) {
  if (page.isClosed?.()) return false;
  if (page._aiAssistRunning || page._aiFormFixing || page._leadRecoveryInProgress || page._lateProgressRecoveryActive) return true;
  try {
    const frames = page.frames?.() || [page];
    if (!frames.length) return true;
    for (const frame of frames) {
      if (frame !== page.mainFrame?.() && typeof frame.frameElement === 'function') {
        const element = await frame.frameElement();
        try { if (!await element.isVisible()) continue; }
        finally { await element.dispose(); }
      }
      const content = await readEvidenceWithTimeout(frame, 'offer-work', () => frame.evaluate(detectOfferContentInPage));
      if (!content || content.loading || content.challenge || content.hasForm || content.hasChoices) return true;
    }
    return false;
  } catch { return true; }
}
