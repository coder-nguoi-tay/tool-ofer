import { performSurveyAnswer } from '../../survey-solver/verification/perform-survey-answer.mjs';

/**
 * Giữ lựa chọn riêng của campaign nhưng chỉ tính đáp án được website xác nhận.
 * Nút Continue và accordion thông tin thuộc luồng điều hướng, không phải đáp án.
 * @param {object} frame Frame đang hiển thị câu hỏi.
 * @param {object} options Callback chẩn đoán và tùy chọn xác minh.
 * @return {Promise<{answered:number,advanced:boolean}>} Kết quả lựa chọn trên bước hiện tại.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function handleSiteSurveyAnswers(frame, options = {}) {
  const result = { answered: 0, advanced: false };
  if (frame._activeAutofillFormScope) return result;
  const currentUrl = typeof frame.url === 'function' ? frame.url() : '';
  try {
    const targets = [];
    if (currentUrl.includes('uplevelrewards.com')) {
      for (const [step, preferredText] of [['q1', /yes/i], ['q2', /myself/i], ['q3', /weekly/i]]) {
        const choices = frame.locator(`section.screen[data-screen="${step}"]:visible`).locator('a.option, button.option, [class*="option"]');
        if (!await choices.count()) continue;
        const preferred = choices.filter({ hasText: preferredText });
        targets.push(await preferred.count() ? preferred.first() : choices.first());
        break;
      }
    } else if (currentUrl.includes('displayoptoffers.com')) {
      targets.push(...await frame.locator('input[type="checkbox"][name*="consent"], input[type="checkbox"][name*="agree"], input[type="checkbox"][id*="consent"]').all());
    }
    for (const target of targets) {
      const answer = await performSurveyAnswer(frame, target, options);
      if (answer.dispatched && answer.verified) result.answered += 1;
      if (answer.advanced) {
        result.advanced = true;
        break;
      }
    }
  } catch {
    options.onLog?.({ type: 'survey_click_failed', detail: 'Câu hỏi campaign chưa thao tác được; giữ nguyên để thử lại.' });
  }
  return result;
}
