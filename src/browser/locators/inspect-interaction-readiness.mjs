/**
 * Xác minh control và nhãn liên kết vẫn hiển thị, thuộc form và không bị widget khóa.
 * @param {Element} element Control cần thao tác.
 * @param {object|null} formScope Phạm vi form đang xử lý.
 * @return {object} Trạng thái ready và lý do từ chối thao tác.
 * @throws {never} Phần tử ngoài vùng nghiệp vụ trả về trạng thái từ chối.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function inspectInteractionReadiness(element, formScope) {
  if (formScope?.active === false || formScope?.unavailable) return { ready: false, reason: 'outside_active_form' };
  if (element.closest?.('footer, nav, aside, [aria-hidden="true"], [role="search"], [role="complementary"], .sidebar, [role="navigation"], [role="contentinfo"], .site-footer, #footer, [data-ux-footer-link], .ow-attribution')) return { ready: false, reason: 'outside_business_content' };
  const footerRegion = element.closest?.('.footer');
  if (footerRegion) {
    const surveyButton = element.matches?.('button[data-ux-adsmith-target]') && footerRegion.closest('.Survey');
    if (!surveyButton || element.closest('a[href]')) return { ready: false, reason: 'outside_business_content' };
  }
  const link = element.closest?.('a[href], area[href]');
  if (link) {
    const href = (link.getAttribute('href') || '').trim();
    const doc = element.ownerDocument;
    const inTaskFrame = doc.location.origin === 'https://sdk.scrptk.com' && doc.location.pathname === '/content/render';
    const verifiedCard = (link.closest('[data-ux-card-id]') && link.matches('[data-ux-offer-cta-id], .offerwall-btn, [data-tf-element-role="offer-btn"]'))
      || (inTaskFrame && link.matches('#infoPanel #infoPanelButton, .unit-stack .unit-card [data-ux-ow-task-button]'));
    const question = link.closest('.Survey .Qst, [role="radiogroup"], .survey-container, .quiz-container, [data-question-id]');
    const surveyContinue = link.matches('.Btm .Next a') && doc.querySelector('.Survey .Qst');
    const localAction = href === '#' || href === '' || /^javascript:void\(0\);?$/i.test(href);
    const formAction = (localAction && (formScope || question || surveyContinue || link.closest('form, [role="form"]')))
      || (href.startsWith('#') && link.hasAttribute('data-ux-choice-id') && (question || link.closest('.question, .q, fieldset, main, [role="main"]')));
    // Đáp án dạng link (CTA ai-cta của Alpha Intent, đáp án bộ dò khảo sát đã chọn) có href thật và tự mở tab mới:
    // chặn chúng làm câu hỏi đứng yên tới khi F5 (offer 3965, 2026-11-21).
    const answerLink = link.matches('[ai-cta]') || (link.hasAttribute('data-ux-choice-id') && (question || link.closest('.question, .q, fieldset, main, [role="main"]')));
    if (!verifiedCard && (link.hasAttribute('download') || !answerLink && (!formAction || (link.target && link.target.toLowerCase() !== '_self')))) return { ready: false, reason: 'navigation_link' };
  }
  const header = element.closest?.('header, [role="banner"], .site-header');
  if (header) {
    const candidateScope = element.closest?.('form, [role="form"], .hero, .form, .form-container, .survey-container, .lead-form, [id*="form" i], [class*="form" i], [id*="lead" i]');
    const businessScope = candidateScope && header.contains(candidateScope) ? candidateScope : null;
    const hasVisibleBusinessField = businessScope && Array.from(businessScope.querySelectorAll('input:not([type="hidden"]), select, textarea')).some(field => {
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(field) : (field.style || {});
      const bounds = typeof field.getBoundingClientRect === 'function' ? field.getBoundingClientRect() : { width: 0, height: 0 };
      return !field.disabled && style.display !== 'none' && !['hidden', 'collapse'].includes(style.visibility) && bounds.width > 0 && bounds.height > 0;
    });
    if (!hasVisibleBusinessField) return { ready: false, reason: 'outside_business_content' };
  }
  const consumed = element.closest?.('[data-ux-offer-action-label]');
  if (consumed && (consumed.innerText || consumed.value || '').replace(/\s+/g, ' ').trim() === consumed.getAttribute('data-ux-offer-action-label')) return { ready: false, reason: 'offer_already_opened' };
  if (formScope && !element.matches?.(formScope.memberSelector)) return { ready: false, reason: 'outside_active_form' };
  if (formScope?.nativeForm && element.form && element.form !== document.querySelector(formScope.rootSelector)) return { ready: false, reason: 'outside_active_form' };
  if (element.matches?.(':disabled, [aria-disabled="true"]') || element.closest?.('[aria-disabled="true"], [aria-busy="true"], [inert]')) return { ready: false, reason: 'element_disabled' };
  /**
   * Xét toàn bộ tổ tiên thay vì chỉ kích thước của control.
   * @param {Element|null} target Control hoặc nhãn thực sự được hiển thị.
   * @return {boolean} Target có vùng tương tác hiển thị.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const visible = target => {
    if (!target || formScope && !target.matches?.(formScope.memberSelector)) return false;
    for (let ancestor = target; ancestor; ancestor = ancestor.parentElement) {
      const style = typeof getComputedStyle === 'function' ? getComputedStyle(ancestor) : (ancestor.style || {});
      if (ancestor.hidden || ancestor.hasAttribute?.('inert') || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false;
    }
    const bounds = typeof target.getBoundingClientRect === 'function' ? target.getBoundingClientRect() : { width: 0, height: 0 };
    return bounds.width > 0 && bounds.height > 0;
  };
  if (visible(element)) return { ready: true };
  const checkable = element.matches?.('input[type="checkbox"], input[type="radio"]');
  const labels = checkable ? Array.from(element.labels || []) : [];
  return labels.some(visible) ? { ready: true, useLabel: true } : { ready: false, reason: 'element_not_visible' };
}
