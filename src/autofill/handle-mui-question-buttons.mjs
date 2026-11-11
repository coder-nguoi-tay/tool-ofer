import { performSurveyAnswer } from '../survey-solver/verification/perform-survey-answer.mjs';
import { resolveActionTarget } from '../ai-assist/resolve-action-target.mjs';
import { clickReadyControl } from '../browser/locators/click-ready-control.mjs';
/**
 * Xử lý màn câu hỏi MUI (Material-UI): lựa chọn là các nút
 * `button[type="button"][data-tf-element-role="submit"][name]` trong container `#questionText`.
 * Chọn đáp án đầu tiên của màn bằng click thật khi widget đã hiển thị.
 *
 * @param {object} page Trang Playwright hiện tại.
 * @param {object} frame Frame đang quét.
 * @param {object} [options={}] Tùy chọn (onLog).
 * @return {Promise<number>} Số thao tác đã thực hiện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function handleMuiQuestionButtons(page, frame, options = {}) {
  if (!frame || typeof frame.locator !== 'function') return 0;
  const now = Date.now();
  if (frame._uxMuiQHandledAt && now - frame._uxMuiQHandledAt < 2000) return 0;
  frame._uxMuiQHandledAt = now;
  const pick = await frame.evaluate(formScope => {
    // Màn MUI có #questionText và nhóm nút lựa chọn
    if (!document.querySelector('#questionText')) return null;
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
    const btns = Array.from(document.querySelectorAll('button[data-tf-element-role="submit"][name], button[type="button"] span.NJBjlW_feedbackLabel')).map(el => el.closest('button') || el).filter(b => isVisible(b) && b.getAttribute('data-ux-mui-clicked') !== '1');
    if (btns.length < 2 || Array.from(document.querySelectorAll('[data-ux-mui-clicked="1"]')).some(isVisible)) return null;
    // User chỉ rõ: tự động chọn câu trả lời ĐẦU TIÊN của màn (không còn random)
    const chosen = btns[0];
    const uid = `ux-mui-${Math.random().toString(36).slice(2, 10)}`;
    chosen.setAttribute('data-ux-mui-mark', uid);
    return {
      uid,
      label: (chosen.innerText || chosen.getAttribute('name') || '').trim().slice(0, 40)
    };
  }, frame._activeAutofillFormScope || null).catch(() => null);
  if (!pick) return 0;
  try {
    const target = await resolveActionTarget(frame, `[data-ux-mui-mark="${pick.uid}"]`);
    if (!target.locator) return 0;
    const result = await performSurveyAnswer(frame, target.locator, options);
    if (result.dispatched && result.verified) {
      await target.locator.evaluate(element => element.setAttribute('data-ux-mui-clicked', '1')).catch(() => {});
      options.onLog?.({
        type: 'mui_question_answered',
        detail: `[MUI Q] Đã chọn đáp án đầu tiên: "${pick.label}".`
      });
      return 1;
    }
  } catch {}
  return 0;
}
export { handleMuiQuestionButtons };
