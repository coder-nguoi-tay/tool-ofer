import { safeSurveyClick } from '../safe-survey-click.mjs';
import { inspectSelectionState } from './inspect-selection-state.mjs';
import { readQuestionState, didQuestionAdvance } from './read-question-state.mjs';

/**
 * Dispatch một câu trả lời rồi xác minh lựa chọn hoặc bước mới trước khi caller tăng answeredCount.
 * @param {object} frame Frame chứa câu hỏi.
 * @param {object} locator Locator của option đã chọn.
 * @param {object} options Callback log và thời gian chờ xác minh.
 * @return {Promise<object>} dispatched, verified, advanced và reason của lượt thao tác.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function performSurveyAnswer(frame, locator, options = {}) {
  if (!await locator.count().catch(() => 0)) return { dispatched:false, verified:false, advanced:false, reason:'target_detached' };
  const before = await readQuestionState(frame);
  if (await locator.evaluate(inspectSelectionState, undefined, { timeout: 250 }).catch(() => false)) return { dispatched: false, verified: true, advanced: false, reason: 'already_selected' };
  const canAttempt = await locator.evaluate(element => {
    const last = Number(element.getAttribute('data-ux-answer-attempt-at') || 0);
    if (Date.now() - last < 600) return false;
    element.setAttribute('data-ux-answer-attempt-at', String(Date.now()));
    return true;
  }, undefined, { timeout: 250 }).catch(() => false);
  if (!canAttempt) return { dispatched: false, verified: false, advanced: false, reason: 'cooldown_or_detached' };
  const dispatched = await safeSurveyClick(frame, locator);
  if (!dispatched) {
    options.onAnswerAttempt?.({ dispatched: false, verified: false });
    options.onLog?.({ type: 'survey_click_failed', detail: 'Không click được lựa chọn; giữ câu hỏi để thử lại.' });
    return { dispatched: false, verified: false, advanced: false, reason: 'click_failed' };
  }
  const deadline = Date.now() + (options.verificationTimeoutMs ?? 450);
  do {
    const after = await readQuestionState(frame);
    if (didQuestionAdvance(before, after)) {
      options.onAnswerAttempt?.({ dispatched: true, verified: true });
      return { dispatched: true, verified: true, advanced: true, reason: 'step_verified' };
    }
    if (await locator.count().catch(() => 0) && await locator.evaluate(inspectSelectionState, undefined, { timeout: 200 }).catch(() => false)) {
      options.onAnswerAttempt?.({ dispatched: true, verified: true });
      return { dispatched: true, verified: true, advanced: false, reason: 'selection_verified' };
    }
    await new Promise(resolve => setTimeout(resolve, 75));
  } while (Date.now() < deadline);
  options.onAnswerAttempt?.({ dispatched: true, verified: false });
  options.onLog?.({ type: 'survey_selection_unverified', detail: 'Đã dispatch click nhưng website chưa xác nhận lựa chọn hoặc chuyển bước.' });
  return { dispatched: true, verified: false, advanced: false, reason: 'selection_unverified' };
}
