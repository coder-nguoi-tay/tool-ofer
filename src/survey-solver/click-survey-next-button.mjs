import { safeSurveyClick } from './safe-survey-click.mjs';

/**
 * Chỉ dispatch nút đi tới rõ nghĩa trong scope sau khi các trường bắt buộc đã hợp lệ.
 * @param {object} frame Frame chứa bước khảo sát hiện tại.
 * @param {object} options Tùy chọn callback log.
 * @return {Promise<boolean>} True khi click Next đã dispatch, không suy ra khảo sát hoàn tất.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export async function clickSurveyNextButton(frame, options = {}) {
  const selector = await frame.evaluate(formScope => {
    /**
     * Kiểm tra tổ tiên và phạm vi thay vì chỉ kích thước control.
     * @param {Element} element Phần tử cần kiểm tra.
     * @return {boolean} Control hiển thị và không bị khóa.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-11
     */
    const ready = element => {
      if (!element || formScope && !element.matches(formScope.memberSelector) || element.matches(':disabled')) return false;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (ancestor.hidden || ancestor.hasAttribute('inert') || ancestor.getAttribute('aria-busy') === 'true' || ancestor.getAttribute('aria-disabled') === 'true' || style.display === 'none' || ['hidden','collapse'].includes(style.visibility) || style.opacity === '0') return false;
      }
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0;
    };
    const invalid = Array.from(document.querySelectorAll('input:invalid,select:invalid,textarea:invalid,[aria-invalid="true"],[data-ux-semantic-owned="1"]:not([data-ux-semantic-answered="1"])')).some(ready);
    if (invalid) return null;
    const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"],a.btn,[role="button"],.next-btn,.continue-btn'));
    const target = buttons.filter(ready).find(element => {
      const text = [element.innerText, element.value, element.getAttribute('aria-label'), element.title].filter(Boolean).join(' ').trim();
      if (/\b(back|prev|previous|cancel|skip|close|privacy|terms|policy|login|help|no thanks|decline)\b|quay lại|bỏ qua/i.test(text)) return false;
      return /^(next|continue|submit|proceed|confirm|finish|done|claim|tiếp tục|tiếp theo|gửi)\b/i.test(text) || element.matches('[type="submit"]');
    });
    if (!target) return null;
    const marker = crypto.randomUUID();
    target.setAttribute('data-survey-next-uid', marker);
    return `[data-survey-next-uid="${marker}"]`;
  }, frame._activeAutofillFormScope || null).catch(() => null);
  if (!selector) return false;
  const clicked = await safeSurveyClick(frame, frame.locator(selector).first());
  if (!clicked) options.onLog?.({ type: 'survey_click_failed', detail: 'Không dispatch được nút Next của khảo sát.' });
  return clicked;
}
