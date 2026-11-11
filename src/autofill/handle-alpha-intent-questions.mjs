import { performSurveyAnswer } from '../survey-solver/verification/perform-survey-answer.mjs';
import { resolveActionTarget } from '../ai-assist/resolve-action-target.mjs';
import { clickReadyControl } from '../browser/locators/click-ready-control.mjs';
import { QUESTION_TYPE_PATTERNS } from './state/question-type-patterns.mjs';

/**
 * Handle alpha intent questions.
 * @param {object} page page.
 * @param {*} frame frame.
 * @param {object} options options.
 * @return {Promise<*>} Kết quả xử lý handle alpha intent questions.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function handleAlphaIntentQuestions(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function') return 0;
  const now = Date.now();
  if (frame._uxQHandledAt && now - frame._uxQHandledAt < 2000) return 0;
  frame._uxQHandledAt = now;
  let action = null;
  try {
    action = await frame.evaluate(({ qPatterns, formScope }) => {
      /**
       * Chờ đáp án hiển thị hoàn toàn trong scope, không click xuyên qua màn fade-out.
       * @param {Element} element Đáp án hoặc nút Continue.
       * @return {boolean} Control đang hiển thị và không bị khóa.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-11
       */
      const isVisible = element => {
        if (!element || formScope && !element.matches(formScope.memberSelector)) return false;
        if (element.matches(':disabled') || element.closest('[aria-disabled="true"], [aria-busy="true"]')) return false;
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (ancestor.hidden || ancestor.hasAttribute('inert') || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false;
        }
        return element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
      };
      // Chỉ đứng trong như thẻ SOI yes/no (handler khác lo) hoặc offerwall card
      const inSoiOrOfferwall = el => !!el.closest('[data-object-creative-type="soiyesno"], .offerwall-card, form[data-tf-element-role="offer"]');
      const answers = Array.from(document.querySelectorAll('button.question-answer-button, button[id^="answer-"]')).filter(b => isVisible(b) && !b.disabled && b.getAttribute('data-ux-qclicked') !== '1' && !inSoiOrOfferwall(b));
      // Câu age/preference/vehicle do handleSurveySemanticQuestions (§17) trả lời; AlphaQ chỉ bấm Continue.
      const qText = (Array.from(document.querySelectorAll('#questionText, h1, h2, h3')).find(isVisible)?.innerText || '').toLowerCase();
      const semanticOwned = qPatterns.some(([, src]) => new RegExp(src).test(qText));
      // Quota đáp án theo loại câu: single = 1, multi-select = 2 (nhanh, không cần đúng) rồi bấm tiếp tục.
      const isMultiSelect = Array.from(document.querySelectorAll('button.ai-submit-button--multiselect, button[class*="multiselect"], [class*="multi-select"], [data-mock-action="multiselect-submit"]')).some(isVisible);
      const answerTarget = isMultiSelect ? 2 : 1;
      const clickedCount = Array.from(document.querySelectorAll('[data-ux-qclicked="1"]')).filter(isVisible).length;
      const quotaReached = clickedCount >= answerTarget;
      if (answers.length && !semanticOwned && !quotaReached) {
        // User chỉ rõ: tự động chọn câu trả lời ĐẦU TIÊN; nếu nút đầu là "None of the Above"/"Skip" thì chọn nút đầu còn lại
        const pickable = answers.filter(b => !/none of the above|none of above|skip|prefer not/i.test(b.innerText || ''));
        const pool = pickable.length ? pickable : answers;
        const pick = pool[0];
        const uid = `ux-qclick-${Math.random().toString(36).slice(2, 10)}`;
        pick.setAttribute('data-ux-qclick-mark', uid);
        return {
          kind: 'answer',
          uid
        };
      }
      // Hết đáp án mới của màn: nếu có nút Continue hiển thị và ta đã click đáp án của màn này
      const pendingSemantic = Array.from(document.querySelectorAll('[data-ux-semantic-owned="1"]:not([data-ux-semantic-answered="1"])')).some(isVisible);
      if (pendingSemantic) return null;
      const screenTouched = Array.from(document.querySelectorAll('[data-ux-qclicked="1"]')).some(isVisible);
      if (screenTouched) {
        const cont = Array.from(document.querySelectorAll('button#submit-button, button[id="submit-button"], [data-testid="submit-button"]')).find(b => isVisible(b) && !b.disabled);
        if (cont) {
          const uid = `ux-qnext-${Math.random().toString(36).slice(2, 10)}`;
          cont.setAttribute('data-ux-qnext-mark', uid);
          return {
            kind: 'continue',
            uid
          };
        }
      }
      return null;
    }, { qPatterns: QUESTION_TYPE_PATTERNS, formScope: frame._activeAutofillFormScope || null }).catch(() => null);
  } catch {}
  if (!action) return 0;
  try {
    const markSel = action.kind === 'answer' ? `[data-ux-qclick-mark="${action.uid}"]` : `[data-ux-qnext-mark="${action.uid}"]`;
    const target = await resolveActionTarget(frame, markSel);
    if (!target.locator) return 0;
    if (action.kind === 'answer') {
      const result = await performSurveyAnswer(frame, target.locator, options);
      if (!result.dispatched || !result.verified) return 0;
    } else if (!await clickReadyControl(target.locator, target.readiness)) return 0;
    if (action.kind === 'answer') {
      await target.locator.evaluate(element => element.setAttribute('data-ux-qclicked', '1')).catch(() => {});
    } else {
      await frame.evaluate(formScope => {
        for (const answer of document.querySelectorAll('[data-ux-qclicked]')) {
          if (!formScope || answer.matches(formScope.memberSelector)) answer.removeAttribute('data-ux-qclicked');
        }
      }, frame._activeAutofillFormScope || null).catch(() => {});
    }
    options.onLog?.({
      type: action.kind === 'answer' ? 'q_answered' : 'submit_clicked',
      detail: action.kind === 'answer' ? '[AlphaQ] Đã chọn đáp án đầu tiên của màn khảo sát (tránh "None of the Above").' : '[AlphaQ] Đã bấm Continue sau khi đã chọn đáp án của màn.'
    });
    return 1;
  } catch {}
  return 0;
}
export { handleAlphaIntentQuestions };
