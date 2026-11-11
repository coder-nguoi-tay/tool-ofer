/**
 * Đọc screenInfo từ DOM trong frame; hàm được Playwright thực thi trực tiếp trong trang.
 * @param {object|null} formScope Phạm vi form/container đang làm việc.
 * @return {*} Kết quả kiểm tra DOM.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function inspectFrameScreen(formScope = null) {
  const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea, [id="btn-option"], .btn-option')).filter(element => !formScope || element.matches(formScope.memberSelector));
  const text = inputs.map(el => `${el.name || ''} ${el.id || ''} ${el.className || ''} ${el.getAttribute('data-tf-element-role') || ''}`).join(' ').toLowerCase();
  const hasDob = /dob|birth|bday|month.*year|year.*month|birth_month|dob_month/i.test(text);
  const hasGender = /gender|male|female/i.test(text);
  const isScreen5 = hasDob && hasGender || hasDob || hasGender && !/phone|address|street|email|firstname/i.test(text);
  const hasEmailInput = inputs.some(el => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    const name = (el.getAttribute('name') || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const role = (el.getAttribute('data-tf-element-role') || '').toLowerCase();
    return type === 'email' || /email/i.test(name) || /email/i.test(id) || /email/i.test(placeholder) || /email/i.test(aria) || role === 'email';
  });
  const hasJumpCta = Boolean(document.querySelector('.cta-button, .rjp-cta-button, .sjp-cta-button, a[href*="/next"], [aria-label*="Reward" i]'));
  const isJumpPage = inputs.length === 0 && hasJumpCta;

  // Chuẩn hóa key input: bỏ số ngẫu nhiên do trang khảo sát sinh lại mỗi vòng
  // (twyinputyes-1595 / -1680 là CÙNG một ô — không được tính là màn khác),
  // chỉ gạt hậu trì -số và chuỗi số dài ≥4 để không va chạm các id kiểu q1/q2.
  const normalizeKey = v => String(v || '').toLowerCase().replace(/-\d+\b|\d{4,}/g, '#');
  const visibleInputKeys = inputs.filter(el => {
    const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
    return !s || s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  }).map(el => `${el.tagName}:${el.type || ''}:${normalizeKey(el.name || el.id || '')}`).slice(0, 15).join(',');
  const activeStep = document.querySelector('.step.is-active, fieldset[data-step]:not([disabled]), .step.active, .current-step, [class*="step-indicator"]');
  const stepIndicator = activeStep ? activeStep.getAttribute('data-step') || String(activeStep.textContent || '').trim().slice(0, 20) || '' : '';
  const screenSignature = `${window.location.pathname}#${stepIndicator}#${visibleInputKeys}`;
  return {
    isScreen5,
    isJumpPage,
    hasDob,
    hasGender,
    hasEmailInput,
    screenSignature
  };
}
