import { MULTI_CHOICE_INDICATORS } from './state/multi-choice-indicators.mjs';
import { NONE_OF_THE_ABOVE_PATTERNS } from './state/none-of-the-above-patterns.mjs';
import { performSurveyAnswer } from './verification/perform-survey-answer.mjs';
import { inspectSelectionState } from './verification/inspect-selection-state.mjs';
import { pickRandomCheckboxItems } from './pick-random-checkbox-items.mjs';

/**
 * Chọn ngẫu nhiên đúng 2 đáp án cho mỗi nhóm checkbox nhiều lựa chọn.
 * Checkbox đơn/consent giữ hành vi riêng và loại trừ "None of the above" khỏi nhóm nhiều lựa chọn.
 *
 * @param {object} frame Frame hoặc Page Playwright.
 * @param {object} [options={}] Tùy chọn pickRandom và xác minh thao tác.
 * @return {Promise<number>} Số câu hỏi checkbox đã hoàn thành.
 * @throws {never} Lỗi frame được xử lý và trả về 0.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function solveSurveyCheckboxes(frame, options = {}) {
  let answered = 0;
  const multiChoicePatternSources = [];
  for (const pattern of MULTI_CHOICE_INDICATORS) {
    multiChoicePatternSources.push(pattern.source);
  }
  try {
    const checkboxGroups = await frame.evaluate(({ patternSources, scopeSelector }) => {
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
      const groups = new Map();
      const rawCandidates = Array.from(document.querySelectorAll(['input[type="checkbox"]', '[role="checkbox"]', '.custom-checkbox', '.checkbox-card', '.check-card', '.survey-checkbox', '[data-checkbox]', 'label.checkbox', '.form-check:has(input[type="checkbox"])'].join(', '))).filter(isVisible);
      rawCandidates.forEach((item, idx) => {
        // Tìm câu hỏi / container bao bọc gần nhất
        const container = item.closest('.twy-customquestion, .question, .survey-question, fieldset, .checkbox-group, .choices, .form-group, .answers, .step-content') || item.parentElement || document.body;
        if (!groups.has(container)) {
          groups.set(container, []);
        }
        const isChecked = item.tagName === 'INPUT' && item.checked || item.getAttribute('aria-checked') === 'true' || item.classList.contains('checked') || item.classList.contains('active') || item.querySelector('input[type="checkbox"]:checked') !== null;
        const label = item.closest('label') || (item.id ? document.querySelector(`label[for="${item.id}"]`) : null) || item;
        const text = (label?.innerText || label?.textContent || item.value || '').trim();
        const uid = `cb_opt_${idx}_${Date.now()}`;
        item.setAttribute('data-survey-cb-uid', uid);
        groups.get(container).push({
          uid,
          text,
          isChecked
        });
      });
      const actionable = [];
      for (const [container, items] of groups.entries()) {
        const hasChecked = items.some(it => it.isChecked);
        const headingText = (container.querySelector('h1, h2, h3, h4, legend, .question-title, .twy-cqlabel, p')?.innerText || '').toLowerCase();

        // Heading kiểu "Select all that apply / must pick 2 / chọn tất cả..." là câu hỏi
        // nhiều lựa chọn — không được nhầm thành consent rồi tick toàn bộ options.
        let matchesMultiChoicePattern = false;
        for (const patternSource of patternSources) {
          if (new RegExp(patternSource, 'i').test(headingText)) {
            matchesMultiChoicePattern = true;
            break;
          }
        }
        const multiChoiceHeading = matchesMultiChoicePattern || /\b(pick|select|choose|chọn)\b/i.test(headingText);

        // Consent phải do heading nói về điều khoản/đồng ý, hoặc từng item tự thân là
        // statement consent ("I agree to the Terms..."). Không dùng từ "required/must"
        // chung chung vì dễ bắt nhầm câu hỏi thường (ví dụ "Women must pick 2").
        const consentByHeading = /terms|privacy|consent|agree|accept|waiver|opt[- ]?in/i.test(headingText) && !multiChoiceHeading;
        const consentByItems = items.length <= 2 && items.every(it => /terms|privacy|consent|agree|accept|waiver|opt[- ]?in/i.test(it.text)) && !multiChoiceHeading;
        if ((consentByHeading || consentByItems || items.length === 1) && items.some(item => !item.isChecked)) {
          actionable.push({
            type: 'consent',
            items
          });
        } else if (!hasChecked && items.length >= 2) {
          actionable.push({
            type: 'multi_choice',
            minimum: Number(headingText.match(/(?:pick|select|choose|chọn)\s+(?:exactly\s+)?(\d+)/i)?.[1] || 1),
            items
          });
        }
      }
      return actionable;
    }, { patternSources: multiChoicePatternSources, scopeSelector: frame._activeAutofillFormScope?.memberSelector }).catch(() => []);
    for (const group of checkboxGroups) {
      if (!group.items.length || group.type !== 'consent' && options.pickRandom !== true) continue;
      const valid = group.items.filter(item => !NONE_OF_THE_ABOVE_PATTERNS.some(pattern => pattern.test(item.text)));
      const pool = group.type === 'consent' ? group.items.filter(item => !item.isChecked) : valid.length ? valid : group.items;
      const minimum = group.type === 'consent' ? group.items.length : group.minimum || 1;
      const picks = group.type === 'consent' ? pool : pickRandomCheckboxItems(pool, 2);
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
