import { selectPageFormFrames as selectEligibleFormFrame } from '../../../../form-scope/select-page-form-frames.mjs';
import { readEvidenceWithTimeout } from '../../../../../logging/recorder/read-evidence-with-timeout.mjs';

/**
 * Giữ lượt quét trong vùng khảo sát 2615 đang nạp sau khi xác minh toàn bộ thẻ iframe cha.
 * @param {object} page Tab Playwright cần xử lý.
 * @return {Promise<object[]>} Frame khảo sát hoặc form thuộc vùng nội dung.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function selectPageFormFrames(page) {
  return selectEligibleFormFrame(page, child => readEvidenceWithTimeout(child, 'survey-loading-area', () => child.evaluate(() => {
    const containers = document.querySelectorAll('#questionText, .survey-container, .quiz-container, #AS_SURVEY, [class*="survey-card" i], [class*="quiz-card" i], .twy-campaigns');
    return Array.from(containers).some(container => {
      if (container.closest('header, footer, nav, aside, [role="navigation"], [role="contentinfo"], [role="complementary"], .ow-attribution, .sidebar')) return false;
      for (let ancestor = container; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (ancestor.matches('[inert], [hidden], [aria-hidden="true"]') || style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') return false;
      }
      return container.getClientRects().length > 0;
    });
  })).catch(() => false));
}
