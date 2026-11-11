import { QUESTION_TYPE_PATTERNS } from './state/question-type-patterns.mjs';
import { buildOptionDecision, extractOptionFeaturesInPage, rankOptions } from '../../option-scorer.mjs';
import { calculateAge } from './calculate-age.mjs';
import { chooseSemanticAnswer } from './choose-semantic-answer.mjs';
import { collectQuestionBlocks } from './semantic/collect-question-blocks.mjs';
import { performSurveyAnswer } from '../survey-solver/verification/perform-survey-answer.mjs';
import { inspectSelectionState } from '../survey-solver/verification/inspect-selection-state.mjs';

/**
 * Trả lời từng block age/preference/vehicle trong form bằng record, block-score hoặc first_answer hợp lệ.
 * @param {object} page Tab sở hữu khảo sát.
 * @param {object} frame Frame có scope đang xử lý.
 * @param {object} options Record và callback log; không mở rộng sang form phụ hoặc bước ẩn.
 * @return {Promise<number>} Số câu vừa được xác minh, dừng ngay khi chuyển bước.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function handleSurveySemanticQuestions(page, frame, options = {}) {
  if (!frame?.locator) return 0;
  if (Date.now() - (frame._uxSemanticQAt || 0) < 1200) return 0;
  frame._uxSemanticQAt = Date.now();
  const record = options.record || {};
  const age = Number(record.age) > 10 ? Number(record.age) : calculateAge(record);
  const blocks = await frame.evaluate(collectQuestionBlocks, { patterns: QUESTION_TYPE_PATTERNS, formScope: frame._activeAutofillFormScope || null }).catch(() => []);
  let answered = 0;
  for (const block of blocks) {
    const selector = block.options.map(marker => `[data-ux-option-uid="${marker}"]`).join(',');
    const locators = frame.locator(selector);
    let alreadySelected = false;
    for (const locator of await locators.all()) if (await locator.evaluate(inspectSelectionState).catch(() => false)) alreadySelected = true;
    if (alreadySelected) {
      await locators.evaluateAll(elements => elements.forEach(element => element.setAttribute('data-ux-semantic-answered','1'))).catch(() => {});
      continue;
    }
    const features = await locators.evaluateAll(extractOptionFeaturesInPage, true).catch(() => []);
    const ranked = rankOptions(features);
    const usable = ranked.filter(candidate => candidate.tier !== 'skip');
    const choice = chooseSemanticAnswer(block.questionType, usable.map(candidate => candidate.label), record, age);
    const selected = choice && usable[choice.index];
    if (!selected) {
      options.onLog?.({ type: 'semantic_q_ambiguous', detail: `Chưa có đáp án hợp lệ cho ${block.questionType}; giữ câu hỏi chưa hoàn tất.` });
      continue;
    }
    const locator = frame.locator(`[data-ux-option-uid="${selected.uid}"]`).first();
    const result = await performSurveyAnswer(frame, locator, options);
    const decision = buildOptionDecision({ questionText: block.heading, ranked, selected, verified: result.verified, fallbackUsed: choice.confidence !== 'record', reason: `${block.questionType}/${choice.confidence}` });
    if (!result.dispatched || !result.verified) {
      options.onLog?.({ type: 'semantic_q_unverified', detail: 'Chưa xác minh đáp án; không khóa câu hỏi là đã trả lời.', decision });
      continue;
    }
    answered++;
    if (!result.advanced) {
      await locator.evaluate(element => { element.setAttribute('data-ux-qclicked','1'); element.setAttribute('data-ux-semantic-clicked','1'); }).catch(() => {});
      await locators.evaluateAll(elements => elements.forEach(element => element.setAttribute('data-ux-semantic-answered','1'))).catch(() => {});
    }
    options.onLog?.({ type: 'semantic_q_answered', detail: `Đã xác minh câu ${block.questionType} theo ${choice.confidence}.`, decision });
    if (result.advanced) break;
  }
  return answered;
}
