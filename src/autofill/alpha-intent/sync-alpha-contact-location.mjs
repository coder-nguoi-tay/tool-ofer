/**
 * Đồng bộ địa chỉ ẩn và metadata; các ô bang/thành phố/zip điền qua luồng chuột tuần tự.
 * @param {object|string|null} scopePayload Giá trị đồng bộ và phạm vi form từ phía ứng dụng.
 * @return {void} Cập nhật control cùng các sự kiện input/change cần thiết.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function syncAlphaContactLocation(scopePayload) {
  const rec = scopePayload?.__formScopePayload ? scopePayload.value : scopePayload;
  const scopeSelector = scopePayload?.__formScopePayload ? scopePayload.scopeSelector : null;
  /**
   * Truy xuất control Alpha Intent thuộc đúng form trước khi đồng bộ giá trị ẩn.
   * @param {string} selector Selector control đặc thù.
   * @return {Element|undefined} Control trong phạm vi hiện tại.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-10
   */
  const findControl = selector => {
    if (/^#[a-zA-Z0-9_-]+$/.test(selector)) {
      const element = document.getElementById(selector.slice(1));
      return element && (!scopeSelector || element.matches(scopeSelector)) ? element : undefined;
    }
    return Array.from(document.querySelectorAll(selector)).find(element => !scopeSelector || element.matches(scopeSelector));
  };
  
  const addrInput = findControl('#address') || findControl('input[data-testid="address-input"]');
  const hiddenAddr = findControl('#input-address') || findControl('input[data-testid="input-address"]');
  const target = (addrInput?.value || rec.address || '4125 N Inspiration Loop').trim();
  if (hiddenAddr && (!hiddenAddr.value || hiddenAddr.value === '')) {
    hiddenAddr.value = target;
    hiddenAddr.dispatchEvent(new Event('input', {
      bubbles: true
    }));
    hiddenAddr.dispatchEvent(new Event('change', {
      bubbles: true
    }));
  }
  if (addrInput) {
    addrInput.dataset.populated = 'true';
    addrInput.dataset.uxFilled = '1';
    addrInput.classList.add('valid-address', 'has-value');
    addrInput.classList.remove('error');
    const err = addrInput.parentElement ? addrInput.parentElement.querySelector('.error-message') : null;
    if (err) err.classList.add('hidden');
    if (rec.city && !addrInput.dataset.city) addrInput.dataset.city = rec.city;
    if (rec.state && !addrInput.dataset.state) addrInput.dataset.state = rec.state;
    if (rec.zipcode && !addrInput.dataset.zipcode) addrInput.dataset.zipcode = rec.zipcode;
  }
}
