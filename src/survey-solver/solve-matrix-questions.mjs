import { performSurveyAnswer } from './verification/perform-survey-answer.mjs';

/**
 * Phân tích và giải quyết các câu hỏi dạng Bảng ma trận / Grid / Likert table (nhiều hàng x nhiều cột).
 *
 * @param {object} frame Frame hoặc Page Playwright.
 * @param {object} [options={}] Tùy chọn.
 * @return {Promise<number>} Số hàng câu hỏi ma trận đã được điền.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function solveMatrixQuestions(frame, options = {}) {
  let answered = 0;
  try {
    const matrixRows = await frame.evaluate(scopeSelector => {
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
      const rows = [];
      const tableRows = Array.from(document.querySelectorAll('table.matrix tr, table.survey-matrix tr, .matrix-row, .grid-row, .likert-row, [data-matrix-row]')).filter(isVisible);
      tableRows.forEach((row, idx) => {
        // Tìm các radio buttons hoặc checkbox con trong hàng này
        const inputs = Array.from(row.querySelectorAll('input[type="radio"], [role="radio"], label:has(input[type="radio"]), .radio-custom, .matrix-cell')).filter(isVisible);
        if (inputs.length >= 2) {
          const hasChecked = inputs.some(inp => inp.tagName === 'INPUT' && inp.checked || inp.getAttribute('aria-checked') === 'true' || inp.classList.contains('active') || inp.classList.contains('selected') || inp.querySelector('input:checked'));
          if (!hasChecked) {
            const uid = `matrix_row_${idx}_${Date.now()}`;
            row.setAttribute('data-survey-matrix-uid', uid);
            rows.push({
              uid,
              optionCount: inputs.length
            });
          }
        }
      });
      return rows;
    }, frame._activeAutofillFormScope?.memberSelector).catch(() => []);
    for (const row of matrixRows) {
      try {
        const rowLocator = frame.locator(`[data-survey-matrix-uid="${row.uid}"]`).first();
        if ((await rowLocator.count()) === 0) continue;

        // Chọn cột điểm trung tính hoặc tích cực (ví dụ Agree / Neutral)
        const pickColIndex = Math.min(row.optionCount - 1, Math.floor(row.optionCount / 2));
        const cells = rowLocator.locator('input[type="radio"], [role="radio"], label:has(input[type="radio"]), .radio-custom, .matrix-cell');
        const targetCell = cells.nth(pickColIndex);
        if ((await targetCell.count()) > 0) {
          await targetCell.scrollIntoViewIfNeeded({
            timeout: 400
          }).catch(() => {});
          const result = await performSurveyAnswer(frame, targetCell, options);
          if (result.dispatched && result.verified) answered++;
        }
      } catch {}
    }
  } catch {}
  return answered;
}
export { solveMatrixQuestions };
