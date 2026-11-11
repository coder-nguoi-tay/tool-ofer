import { clickSurveyNextButton } from './click-survey-next-button.mjs';
import { solveDropdownQuestions } from './solve-dropdown-questions.mjs';
import { solveMatrixQuestions } from './solve-matrix-questions.mjs';
import { solveRatingQuestions } from './solve-rating-questions.mjs';
import { solveSurveyCheckboxes } from './solve-survey-checkboxes.mjs';
import { readQuestionState, didQuestionAdvance } from './verification/read-question-state.mjs';

/**
 * Giải một bước khảo sát, chỉ tính đáp án đã xác minh và nhận auto-advance SPA bằng cấu trúc câu hỏi.
 * @param {object} frame Frame đang xử lý.
 * @param {object} record Dữ liệu record hiện tại.
 * @param {object} options Cấu hình lựa chọn, autoClickNext và callback log.
 * @return {Promise<object>} answeredCount, trạng thái chuyển bước và nguyên nhân dừng tương thích API cũ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function solveSurveyStep(frame, record = {}, options = {}) {
  const before = await readQuestionState(frame);
  const result = { answeredCount: 0, autoAdvanced: false, nextClicked: false, attemptedCount: 0, verifiedCount: 0, failedCount: 0, status: 'stalled', reason: 'no_progress' };
  const solverOptions = { ...options, record, onAnswerAttempt: outcome => {
    result.attemptedCount++;
    if (!outcome.verified) result.failedCount++;
    options.onAnswerAttempt?.(outcome);
  } };
  if (before.available && !before.hasControls && !before.hasQuestions) return { ...result, status: before.completed ? 'finished' : before.hasContent && !before.busy ? 'unsupported' : 'stalled', reason: before.completed ? 'completion_confirmed' : before.busy ? 'loading' : 'no_visible_interactions' };
  for (const solve of [solveRatingQuestions, solveMatrixQuestions, solveSurveyCheckboxes, solveDropdownQuestions]) {
    result.answeredCount += await solve(frame, solverOptions);
    const after = await readQuestionState(frame);
    if (didQuestionAdvance(before, after)) {
      result.autoAdvanced = true;
      break;
    }
  }
  result.verifiedCount = result.answeredCount;
  if (result.autoAdvanced) return { ...result, status: 'advanced', reason: 'question_identity_changed' };
  if (result.answeredCount > 0 && options.autoClickNext !== false) result.nextClicked = await clickSurveyNextButton(frame, options);
  if (result.answeredCount > 0 || result.nextClicked) return { ...result, status: result.nextClicked ? 'advanced' : 'answered', reason: result.nextClicked ? 'next_dispatched' : 'selection_verified' };
  if (result.failedCount) return { ...result, status: 'click_failed', reason: 'selection_not_verified' };
  if (before.available && before.hasQuestions && !before.supportedCount) {
    options.onLog?.({ type: 'unsupported_question', detail: 'Khảo sát có control nhưng chưa có solver hỗ trợ; không đánh dấu hoàn tất.' });
    return { ...result, status: 'unsupported', reason: 'no_supported_solver' };
  }
  return { ...result, reason: before.available ? 'awaiting_action_or_record' : 'inspection_unavailable' };
}
