import { inspectSurveyDropdowns } from './inspect-survey-dropdowns.mjs';
import { selectOptionWithHumanInteraction } from '../autofill/select/select-option-with-human-interaction.mjs';
import { reportSelectMismatch } from '../autofill/report-select-mismatch.mjs';

/**
 * Chọn dropdown khảo sát bằng chuột, xác minh giá trị và ghi lý do nếu không chọn được.
 * @param {object} frame Frame hoặc Page chứa câu hỏi.
 * @param {object} options Cờ chọn ngẫu nhiên và callback log; tắt ngẫu nhiên thì lấy option hợp lệ đầu tiên.
 * @return {Promise<number>} Số dropdown đã được website xác nhận giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function solveDropdownQuestions(frame, options = {}) {
  let answered = 0;
  const page = typeof frame.page === 'function' ? frame.page() : frame;
  const groups = await frame.evaluate(inspectSurveyDropdowns, frame._activeAutofillFormScope?.memberSelector).catch(() => []);
  for (const item of groups) {
    const target = options.pickRandom === true ? item.options[Math.floor(Math.random() * item.options.length)] : item.options[0];
    const field = frame.locator(`[data-survey-dropdown-uid="${item.uid}"]`).first();
    const result = target
      ? await selectOptionWithHumanInteraction({ page, field, candidates: [target.value] }).catch(() => ({ verified: false, reason: 'select_unavailable' }))
      : { verified: false, reason: 'survey_options_unavailable' };
    if (!result.verified) {
      reportSelectMismatch(frame, item, target ? [target.value] : [], result, options, page);
      continue;
    }
    await field.evaluate(select => { select.setAttribute('data-survey-dropdown-filled', '1'); }).catch(() => {});
    answered++;
    options.onLog?.({ type: 'survey_answered', field: item.id || item.name, detail: 'Đã chọn và xác minh dropdown khảo sát bằng thao tác chuột.' }, page);
  }
  return answered;
}
