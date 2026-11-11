import { solveSurveyStep } from './solve-survey-step.mjs';

/**
 * Chạy các bước đã hỗ trợ; chỉ finished khi DOM xác nhận không còn câu hỏi/CTA, không suy từ answeredCount=0.
 * @param {object} page Tab khảo sát.
 * @param {object} record Record hiện tại.
 * @param {object} options Giới hạn bước và callback tiến độ.
 * @return {Promise<object>} completedSteps, finished, status và reason khi dừng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function runMultiStepSurveyLoop(page, record = {}, options = {}) {
  const maxSteps = options.maxSteps ?? 25;
  let completedSteps = 0;
  for (let step = 1; step <= maxSteps; step++) {
    if (page.isClosed()) return { completedSteps, finished: false, status: 'closed', reason: 'tab_closed' };
    const result = await solveSurveyStep(page, record, options);
    options.onStepDone?.({ step, ...result });
    if (result.status === 'finished') return { completedSteps, finished: true, status: 'finished', reason: result.reason };
    if (!result.autoAdvanced && !result.nextClicked) return { completedSteps, finished: false, status: result.status, reason: result.reason };
    completedSteps++;
    await new Promise(resolve => setTimeout(resolve, options.stepDelayMs ?? 500));
  }
  return { completedSteps, finished: false, status: 'stalled', reason: 'max_steps_reached' };
}
