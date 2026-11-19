/**
 * Gửi dự phòng cho form HTML đã xác minh khi nút gửi vắng mặt.
 * Hàm tự chứa để Playwright chạy trong trang, bỏ qua form đã ẩn sau khi submit.
 * @param {object|null} formScope Phạm vi gửi dự phòng, không mở rộng sang form khác.
 * @return {object} Phương thức đã gửi hoặc none nếu trang đang chuyển bước/đang xử lý.
 * @throws {DOMException} Trình duyệt có thể từ chối gửi form đã bị tháo khỏi DOM.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function submitVisibleFormFallback(formScope = null) {
  if (!formScope?.active || formScope.unavailable || !formScope.nativeForm) return { method: 'none' };
  const form = document.querySelector(formScope.rootSelector);
  if (form?.tagName !== 'FORM' || form.closest('[aria-busy="true"], [inert]')) return { method: 'none' };
  /**
   * Xác định trường/nút còn hiển thị sau khi chuyển bước hoặc ẩn form.
   * @param {Element} element Phần tử cần xét cùng các phần tử cha.
   * @return {boolean} Có thể nhìn thấy phần tử.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const isVisible = element => {
    if (!element || element.hidden || !element.matches(formScope.memberSelector)) return false;
    for (let parent = element; parent; parent = parent.parentElement) {
      const style = window.getComputedStyle(parent);
      if (parent.hidden || parent.hasAttribute('inert') || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0') return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  /**
   * Bỏ qua trường/nút bị khóa trong lúc trang xử lý submit.
   * @param {Element} element Trường hoặc nút của form.
   * @return {boolean} Phần tử đang sẵn sàng để tương tác.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const isReady = element => isVisible(element) && !element.matches(':disabled') && !element.closest('[aria-disabled="true"], [aria-busy="true"]');
  /**
   * Ghi nhận định danh phần tử đã submit cho nhật ký phiên.
   * @param {Element} element Form hoặc nút đã được gửi.
   * @return {object} Thẻ, id và class của phần tử.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const identity = element => ({ tag: element.tagName.toLowerCase(), id: element.id || null, className: String(element.className || '') });
  const controls = Array.from(form.elements);
  if (!controls.some(isReady)) return { method: 'none' };
  const submitControls = controls.filter(element => element.type === 'submit');
  if (submitControls.length && !submitControls.some(isReady)) return { method: 'none' };
  // Có nút tùy biến chưa xác định được: không bỏ qua onclick bằng requestSubmit.
  if (controls.some(element => element.matches('button, input[type="button"]') && isVisible(element))) return { method: 'none' };
  const radios = Array.from(form.querySelectorAll('input[type="radio"]')).filter(isVisible);
  if ([...new Set(radios.map(radio => radio.name).filter(Boolean))].some(name => !radios.some(radio => radio.name === name && radio.checked))) return { method: 'none' };
  const invalid = Array.from(form.querySelectorAll('input:invalid, textarea:invalid, select:invalid, [aria-invalid="true"], input.invalid, select.invalid, input.error, select.error')).some(element => isVisible(element) && element.type !== 'hidden' && !element.matches(':disabled'));
  const error = Array.from(form.querySelectorAll('.error-message, .form-error, .invalid-feedback, .error-text, .error:not(input):not(select)')).some(element => isVisible(element) && (element.innerText || '').trim());
  if (invalid || error || Date.now() - Number(form.dataset.uxLastSubmitTime || 0) < 1200) return { method: 'none' };
  form.dataset.uxLastSubmitTime = String(Date.now());
  if (typeof form.requestSubmit === 'function') {
    form.requestSubmit();
    return { method: 'form_requestSubmit', ...identity(form) };
  }
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  return { method: 'form_dispatchEvent', ...identity(form) };
}
