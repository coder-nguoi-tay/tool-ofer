/**
 * Gửi dự phòng khi không tìm được nút chuẩn; chỉ tương tác form/nút còn hiển thị và sẵn sàng.
 * Hàm tự chứa để Playwright chạy trong trang, bỏ qua form đã ẩn sau khi submit.
 * @param {object|null} formScope Phạm vi gửi dự phòng, không mở rộng sang form khác.
 * @return {object} Phương thức đã gửi hoặc none nếu trang đang chuyển bước/đang xử lý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function submitVisibleFormFallback(formScope = null) {
  /**
   * Xác định trường/nút còn hiển thị sau khi chuyển bước hoặc ẩn form.
   * @param {Element} element Phần tử cần xét cùng các phần tử cha.
   * @return {boolean} Có thể nhìn thấy phần tử.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const isVisible = element => {
    if (!element || element.hidden || formScope && !element.matches(formScope.memberSelector)) return false;
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
  const allForms = Array.from(document.querySelectorAll('form')).filter(form => !formScope || form.matches(formScope.rootSelector));
  const forms = allForms.filter(form => {
    if (form.getAttribute('aria-busy') === 'true') return false;
    const controls = Array.from(form.elements);
    if (!controls.some(isReady)) return false;
    const submitControls = controls.filter(element => element.type === 'submit');
    return !submitControls.length || submitControls.some(isReady);
  });
  if (!forms.length && formScope?.nativeForm) return { method: 'none' };
  if (!forms.length) {
    // Chỉ xét nút độc lập; nút của form đã ẩn/đang xử lý không được gửi lại.
    const candidates = Array.from(document.querySelectorAll('button[type="submit"], input[type="submit"], [role="button"], div.button, div.btn-option, .btn-option, a.btn, button:not([type="reset"])')).filter(element => {
      if (element.closest('form') || !isReady(element)) return false;
      const text = [element.innerText, element.value, element.getAttribute('aria-label'), element.title].filter(Boolean).join(' ').trim();
      if (/\b(back|previous|prev|cancel|skip|close|privacy|terms|policy|login|sign in|help|no thanks|decline)\b|quay lại|bỏ qua|hủy/i.test(text)) return false;
      return element.matches('button[type="submit"],input[type="submit"]') || /^(continue|next|submit|claim|confirm|finish|done|proceed|get\b|unlock\b|tiếp tục|gửi|hoàn thành)/i.test(text);
    });
    const button = candidates.find(element => element.matches('[type="submit"]')) || candidates[0];
    if (!button) return { method: 'none' };
    button.click();
    return { method: 'button_click', ...identity(button) };
  }
  for (const form of forms) {
    // Có nút tùy biến chưa xác định được: không bỏ qua onclick bằng requestSubmit.
    if (Array.from(form.elements).some(element => element.matches('button, input[type="button"]') && isVisible(element))) continue;
    const radios = Array.from(form.querySelectorAll('input[type="radio"]')).filter(isVisible);
    if ([...new Set(radios.map(radio => radio.name).filter(Boolean))].some(name => !radios.some(radio => radio.name === name && radio.checked))) continue;
    const invalid = Array.from(form.querySelectorAll('input:invalid, textarea:invalid, select:invalid, [aria-invalid="true"], input.invalid, select.invalid, input.error, select.error')).some(element => isVisible(element) && element.type !== 'hidden' && !element.matches(':disabled'));
    const error = Array.from(form.querySelectorAll('.error-message, .form-error, .invalid-feedback, .error-text, .error:not(input):not(select)')).some(element => isVisible(element) && (element.innerText || '').trim());
    if (invalid || error || Date.now() - Number(form.dataset.uxLastSubmitTime || 0) < 1200) continue;
    form.dataset.uxLastSubmitTime = String(Date.now());
    if (typeof form.requestSubmit === 'function') {
      form.requestSubmit();
      return { method: 'form_requestSubmit', ...identity(form) };
    }
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    return { method: 'form_dispatchEvent', ...identity(form) };
  }
  return { method: 'none' };
}
