/**
 * Đồng bộ các control liên hệ ẩn của đúng form Alpha Intent.
 * @param {object|string|null} scopePayload Giá trị đồng bộ và phạm vi form từ phía ứng dụng.
 * @return {void} Cập nhật control cùng các sự kiện input/change cần thiết.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function syncAlphaHiddenContactData(scopePayload) {
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
  
  const addr = findControl('#address');
  const hiddenAddr = findControl('#input-address');
  const addressWidget = addr?.matches?.('[role=combobox], [aria-autocomplete], [aria-controls], [aria-owns], [list], .autocomplete, .typeahead') || addr?._autoleadAddressChoice ||
    addr?.form?.querySelector('input[name=place_id], input[name=address_id], select[name*=address i], .address-suggestions') ||
    /^(placeid|addressid)$/i.test((hiddenAddr?.name || '').replace(/[-_]/g, ''));
  if (addr?.value && hiddenAddr?.readOnly && hiddenAddr.form === addr.form && hiddenAddr.value !== addr.value && !addressWidget) {
    hiddenAddr.value = addr.value;
    hiddenAddr.dispatchEvent(new Event('input', {
      bubbles: true
    }));
    hiddenAddr.dispatchEvent(new Event('change', {
      bubbles: true
    }));
  }
  const date = findControl('#date');
  const hiddenDob = findControl('#input-dob');
  if (date && date.value && !date.value.includes('_') && hiddenDob && hiddenDob.readOnly) {
    hiddenDob.value = date.value;
    hiddenDob.dispatchEvent(new Event('input', {
      bubbles: true
    }));
    hiddenDob.dispatchEvent(new Event('change', {
      bubbles: true
    }));
  }
  const phone = findControl('#phone');
  const hiddenPhone = findControl('#input-phone');
  if (phone && phone.value && hiddenPhone && hiddenPhone.readOnly) {
    hiddenPhone.value = phone.value;
    hiddenPhone.dispatchEvent(new Event('input', {
      bubbles: true
    }));
    hiddenPhone.dispatchEvent(new Event('change', {
      bubbles: true
    }));
  }
  const name = findControl('#name');
  const hiddenName = findControl('#input-fullname');
  if (name && name.value && hiddenName && hiddenName.readOnly) {
    hiddenName.value = name.value;
    hiddenName.dispatchEvent(new Event('input', {
      bubbles: true
    }));
    hiddenName.dispatchEvent(new Event('change', {
      bubbles: true
    }));
  }
}
