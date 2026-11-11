import { resolveActionTarget } from '../../ai-assist/resolve-action-target.mjs';
import { performSurveyAnswer } from '../../survey-solver/verification/perform-survey-answer.mjs';

/**
 * Click một đáp án Yes/No theo trạng thái fallback và xác minh lựa chọn trước khi ghi tiến độ.
 * @param {object} context Frame, tab, câu hỏi, trạng thái lựa chọn và callback log.
 * @return {Promise<object>} Quyết định giữ bước và số thao tác đã xác minh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function selectYesNoAnswer({ frame, page, question, state, options }) {
  const target = await resolveActionTarget(frame, state.no ? question.no : question.yes);
  if (!target.locator) return { handled: true, actions: 0 };
  const result = await performSurveyAnswer(frame, target.locator, options);
  const verified = result.dispatched && result.verified;
  if (verified) options.onLog?.({ type: question.twy ? 'twy_card_answered' : 'survey_answered', detail: `Đã chọn ${state.no ? 'No' : 'Yes'} cho câu hỏi đang hiển thị.` }, page);
  return { handled: true, actions: Number(verified) };
}
