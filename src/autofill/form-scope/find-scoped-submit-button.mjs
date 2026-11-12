import { SURVEY_LEGAL_NOISE_RE } from '../../survey-solver/state/survey-legal-noise-re.mjs';

/**
 * Tìm nút gửi thuộc đúng form, kể cả nút HTML liên kết bằng thuộc tính form ở bên ngoài.
 * @param {object} frame Frame chứa form đang điền.
 * @param {object} formScope Phạm vi hiện tại, không giới hạn theo vị trí đầu trang.
 * @return {Promise<object|null>} Locator nút gửi sẵn sàng hoặc null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export async function findScopedSubmitButton(frame, formScope) {
  const selector = await frame.evaluate(({ scope, legalNoiseSource }) => {
    const legalNoise = new RegExp(legalNoiseSource, 'i');
    const root = document.querySelector(scope.rootSelector);
    if (!root) return null;
    /**
   * Kiểm tra phần tử của biểu mẫu còn hiển thị qua toàn bộ các phần tử cha.
   * @param {Element} element Control hoặc vùng biểu mẫu cần kiểm tra.
   * @return {boolean} Phần tử đang hiển thị.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-10
   */
  const visible = element => {
      for (let parent = element; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      }
      const bounds = element.getBoundingClientRect();
      return bounds.width > 4 && bounds.height > 4;
    };
    const controls = Array.from(document.querySelectorAll(scope.memberSelector));
    const buttons = controls.filter(element => element.matches('button, input[type="submit"], input[type="image"], input[type="button"], a, [role="button"], div.btn, div.button, .sbtn, #sub-btn') && (!scope.nativeForm || !element.form || element.form === root) && visible(element));
    const native = buttons.filter(button => root.tagName === 'FORM' && button.form === root && ['submit', 'image'].includes(button.type));
    /**
     * Tôn trọng trạng thái khóa hoặc đang gửi dữ liệu của nút.
     * @param {Element} button Nút gửi thuộc form hiện tại.
     * @return {boolean} Nút sẵn sàng nhận thao tác.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-10
     */
    const ready = button => !button.matches(':disabled') && !button.closest('[aria-busy="true"], [aria-disabled="true"]');
    /**
     * Loại nút hủy, quay lại, liên kết pháp lý và đáp án khảo sát khỏi nút gửi.
     * @param {Element} button Nút ứng viên trong form hiện tại.
     * @return {boolean} Ứng viên có thể là nút gửi của form.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-10
     */
    const safe = button => button.type !== 'reset' && !/^(back|previous|cancel|close|no thanks|skip|quay lại|hủy|đóng)$/i.test((button.innerText || button.value || '').trim()) && !/(^|[^a-z])(back|prev|previous)(?![a-z])/i.test(`${button.id} ${button.className}`) && !((button.tagName === 'A' || button.hasAttribute('href')) && (legalNoise.test(button.textContent || '') || legalNoise.test(button.getAttribute('href') || ''))) && !button.matches('[data-action*="answer"], [data-vector-answer], .question-answer-button, [id^="answer-"], .offerwall-btn, .btn-option');
    const eligible = buttons.filter(button => ready(button) && safe(button));
    const primaryNative = native.filter(safe);
    let button = primaryNative.find(ready);
    // Nút native đang bị khóa là trạng thái đang xử lý; không lách qua CTA phụ.
    if (!button && primaryNative.length) return null;
    button ||= eligible.find(element => /submit|continue|next|confirm|sign[_-]?up|register|sub-btn|sbtn/i.test([element.id, element.className, element.getAttribute('data-action'), element.getAttribute('data-vector-submit')].join(' ')));
    button ||= eligible.find(element => /^(continue|next|submit|finish|confirm|tiếp tục|gửi|xác nhận)$/i.test((element.innerText || element.value || '').trim()));
    if (!button && eligible.length === 1) button = eligible[0];
    if (!button) return null;
    for (const previous of document.querySelectorAll('[data-ux-scoped-submit="' + scope.id + '"]')) if (previous !== button) previous.removeAttribute('data-ux-scoped-submit');
    if (button.getAttribute('data-ux-scoped-submit') !== scope.id) button.setAttribute('data-ux-scoped-submit', scope.id);
    return '[data-ux-scoped-submit="' + scope.id + '"]';
  }, { scope: formScope, legalNoiseSource: SURVEY_LEGAL_NOISE_RE.source }).catch(() => null);
  return selector ? frame.locator(selector).first() : null;
}
