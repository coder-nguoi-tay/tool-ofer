import { inspectCheckboxGroups } from './inspect-checkbox-groups.mjs';
import { MULTI_CHOICE_INDICATORS } from './state/multi-choice-indicators.mjs';
import { NONE_OF_THE_ABOVE_PATTERNS } from './state/none-of-the-above-patterns.mjs';
import { performSurveyAnswer } from './verification/perform-survey-answer.mjs';
import { inspectSelectionState } from './verification/inspect-selection-state.mjs';
import { pickRandomCheckboxItems } from './pick-random-checkbox-items.mjs';

/**
 * Hoàn tất nhóm checkbox: chọn tối đa 2 đáp án, giữ lựa chọn có sẵn và chỉ trộn khi bật pickRandom.
 * Checkbox đơn/consent giữ hành vi riêng và loại trừ "None of the above" khỏi nhóm nhiều lựa chọn.
 *
 * @param {object} frame Frame hoặc Page Playwright.
 * @param {object} [options={}] Tùy chọn pickRandom và xác minh thao tác.
 * @return {Promise<number>} Số câu hỏi checkbox đã hoàn thành.
 * @throws {never} Lỗi frame được xử lý và trả về 0.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function solveSurveyCheckboxes(frame, options = {}) {
  let answered = 0;
  const multiChoicePatternSources = [];
  for (const pattern of MULTI_CHOICE_INDICATORS) {
    multiChoicePatternSources.push(pattern.source);
  }
  try {
    const checkboxGroups = await frame.evaluate(inspectCheckboxGroups, { patternSources: multiChoicePatternSources, scopeSelector: frame._activeAutofillFormScope?.memberSelector }).catch(() => []);
    for (const group of checkboxGroups) {
      if (!group.items.length) continue;
      const valid = group.items.filter(item => !item.isChecked && !NONE_OF_THE_ABOVE_PATTERNS.some(pattern => pattern.test(item.text)));
      const pool = group.type === 'consent' ? group.items.filter(item => !item.isChecked) : valid.length ? valid : group.items.filter(item => !item.isChecked);
      const minimum = group.type === 'consent' ? group.items.length : group.minimum || 1;
      const picks = group.type === 'consent' ? pool : options.pickRandom === true ? pickRandomCheckboxItems(pool, Math.min(2, group.countToPick)) : pool.slice(0, Math.min(2, group.countToPick));
      let dispatched = false;
      let advanced = false;
      for (const item of picks) {
        const locator = frame.locator(`[data-survey-cb-uid="${item.uid}"]`).first();
        if (!await locator.count()) continue;
        const result = await performSurveyAnswer(frame, locator, options);
        dispatched ||= result.dispatched;
        if (result.advanced) { advanced = true; break; }
      }
      if (!dispatched) continue;
      if (advanced) { answered++; continue; }
      let selected = 0;
      for (const item of group.items) {
        const locator = frame.locator(`[data-survey-cb-uid="${item.uid}"]`).first();
        if (await locator.evaluate(inspectSelectionState).catch(() => false)) selected++;
      }
      if (selected >= minimum) answered++;
    }

  } catch {}
  return answered;
}
export { solveSurveyCheckboxes };
