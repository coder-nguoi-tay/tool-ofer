// Bản giải riêng của offer 2615, chép từ src/autofill/form-scope/find-scoped-submit-button.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { FORM_UTILITY_REGIONS } from '../../../../../browser/locators/form-utility-regions.mjs';
import { SURVEY_LEGAL_NOISE_RE } from '../../../../../survey-solver/state/survey-legal-noise-re.mjs';

/**
 * Tìm nút gửi thuộc đúng form, kể cả nút HTML liên kết bằng thuộc tính form ở bên ngoài.
 * @param {object} frame Frame chứa form đang điền.
 * @param {object|null} formScope Phạm vi hiện tại, không giới hạn theo vị trí đầu trang.
 * @return {Promise<object|null>} Locator nút gửi sẵn sàng hoặc null.
 * @throws {never} Phạm vi không còn đọc được trả về null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function findScopedSubmitButton(frame, formScope) {
  if (!formScope?.active || formScope.unavailable) return null;
  const selector = await frame.evaluate(({ scope, legalNoiseSource, excludedRegions }) => {
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
    /**
     * Loại điều hướng, phần chân trang và vùng thẻ offer khỏi thao tác gửi form.
     * @param {Element} element Thành viên đang xét trong phạm vi.
     * @return {boolean} Phần tử thuộc vùng dành cho thao tác khác.
     * @throws {never} Chỉ đọc cây DOM.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-19
     */
    const isExcludedNav = element => {
      if (element.closest(excludedRegions + ', [data-ux-footer-link], .offerwall-card, .offerwall-card-wrap, [data-ux-card-id], [data-tf-element-role="offer-btn"], form[data-tf-element-role="offer"]')) return true;
      const headerEl = element.closest?.('header, [role="banner"], .site-header');
      if (headerEl) {
        const headerHasInputs = Boolean(headerEl.querySelector?.('input:not([type="hidden"]), select, textarea'));
        const headerIsHeroContainer = Boolean(headerEl.matches?.('.hero, [id*="form" i], [class*="form" i], .lead-form, [id*="lead" i]') || headerEl.querySelector?.('form, [role="form"], .form, .form-container, .survey-container'));
        if (!headerHasInputs && !headerIsHeroContainer) return true;
      }
      return false;
    };
    /**
     * Một link có đích điều hướng hoặc tải xuống không thể làm nút gửi biểu mẫu.
     * @param {Element} element Ứng viên, có thể là phần tử con của link.
     * @return {boolean} Phần tử thuộc link điều hướng.
     * @throws {never} Chỉ đọc thuộc tính DOM.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-19
     */
    const isNavigationLink = element => {
      if (element.closest('[role="link"], area[href]')) return true;
      const link = element.closest('a');
      if (!link) return false;
      const href = (link.getAttribute('href') || '').trim();
      return link.hasAttribute('download') || (link.target && link.target.toLowerCase() !== '_self')
        || !/^(?:#?|javascript:void\(0\);?)$/i.test(href);
    };
    const buttons = controls.filter(element =>
      element.matches('button, input[type="submit"], input[type="image"], input[type="button"], a, [role="button"], div.btn, div.button, .sbtn, #sub-btn')
      && (!scope.nativeForm || !element.form || element.form === root)
      && !isExcludedNav(element) && !isNavigationLink(element) && visible(element)
    );
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
    if (!button && eligible.length === 1 && !eligible[0].closest('a')) button = eligible[0];
    if (!button) return null;
    for (const previous of document.querySelectorAll('[data-ux-scoped-submit="' + scope.id + '"]')) if (previous !== button) previous.removeAttribute('data-ux-scoped-submit');
    if (button.getAttribute('data-ux-scoped-submit') !== scope.id) button.setAttribute('data-ux-scoped-submit', scope.id);
    return '[data-ux-scoped-submit="' + scope.id + '"]';
  }, { scope: formScope, legalNoiseSource: SURVEY_LEGAL_NOISE_RE.source, excludedRegions: FORM_UTILITY_REGIONS }).catch(() => null);
  return selector ? frame.locator(selector).first() : null;
}
