import { performSurveyAnswer } from './verification/perform-survey-answer.mjs';

/**
 * Phân tích và giải quyết các câu hỏi dạng Đánh giá / Thang điểm (Rating Scales & NPS 1-10, 1-5 Stars).
 *
 * @param {object} frame Frame hoặc Page Playwright.
 * @param {object} [options={}] Tùy chọn (ưu tiên điểm tích cực, điểm trung tính).
 * @return {Promise<number>} Số câu hỏi rating đã được trả lời.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function solveRatingQuestions(frame, options = {}) {
  let answered = 0;
  try {
    const ratingGroups = await frame.evaluate(scopeSelector => {
      /**
       * Chỉ xét control hiển thị thuộc form hoặc khảo sát đang xử lý.
       * @param {Element} el Phần tử cần kiểm tra.
       * @return {boolean} Phần tử hợp lệ trong phạm vi hiện tại.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-11
       */
      const isVisible = el => {
        if (scopeSelector && !el?.matches(scopeSelector)) return false;
        if (!el || el.disabled) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const groups = [];

      // 1. Dãy nút số từ 1..5 hoặc 0..10 (NPS scale)
      const scaleContainers = Array.from(document.querySelectorAll('.nps-scale, .rating-scale, .likert-scale, .rating-container, [data-rating-group], .scale-row, ul.rating')).filter(isVisible);
      scaleContainers.forEach((container, idx) => {
        const buttons = Array.from(container.querySelectorAll('button, .scale-item, [role="radio"], label, input[type="radio"], .nps-num, [data-value]')).filter(isVisible);
        if (buttons.length >= 3 && buttons.length <= 11) {
          const hasSelected = buttons.some(b => b.classList.contains('active') || b.classList.contains('selected') || b.getAttribute('aria-checked') === 'true' || b.tagName === 'INPUT' && b.checked || b.querySelector('input:checked'));
          if (!hasSelected) {
            const uid = `rating_grp_${idx}_${Date.now()}`;
            container.setAttribute('data-survey-rating-uid', uid);
            groups.push({
              uid,
              type: 'numeric_scale',
              totalCount: buttons.length
            });
          }
        }
      });

      // 2. Đánh giá sao (Stars 1-5)
      const starContainers = Array.from(document.querySelectorAll('.star-rating, .stars, .rating-stars, [data-stars]')).filter(isVisible);
      starContainers.forEach((container, idx) => {
        const stars = Array.from(container.querySelectorAll('.star, [data-star], svg.star, [data-value]')).filter(isVisible);
        if (stars.length >= 3 && stars.length <= 5) {
          const uid = `star_grp_${idx}_${Date.now()}`;
          container.setAttribute('data-survey-star-uid', uid);
          groups.push({
            uid,
            type: 'stars',
            totalCount: stars.length
          });
        }
      });
      return groups;
    }, frame._activeAutofillFormScope?.memberSelector).catch(() => []);
    for (const group of ratingGroups) {
      try {
        const containerLocator = group.type === 'stars' ? frame.locator(`[data-survey-star-uid="${group.uid}"]`).first() : frame.locator(`[data-survey-rating-uid="${group.uid}"]`).first();
        if ((await containerLocator.count()) === 0) continue;

        // Chọn điểm số: thường chọn mức tích cực (4/5 sao, hoặc 8/10 NPS)
        let targetIndex = Math.floor(group.totalCount * 0.75);
        if (targetIndex >= group.totalCount) targetIndex = group.totalCount - 1;
        const itemsLocator = containerLocator.locator(group.type === 'stars' ? '.star, [data-star], svg.star, [data-value]' : 'button, .scale-item, [role="radio"], label, input[type="radio"], .nps-num, [data-value]');
        const targetItem = itemsLocator.nth(targetIndex);
        if ((await targetItem.count()) > 0) {
          await targetItem.scrollIntoViewIfNeeded({
            timeout: 400
          }).catch(() => {});
          const result = await performSurveyAnswer(frame, targetItem, options);
          if (result.dispatched && result.verified) answered++;
        }
      } catch {}
    }
  } catch {}
  return answered;
}
export { solveRatingQuestions };
