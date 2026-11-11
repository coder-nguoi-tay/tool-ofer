/**
 * Đồng bộ lựa chọn TCPA của form Alpha Intent đang thực hiện.
 * @param {object|string|null} scopePayload Giá trị đồng bộ và phạm vi form từ phía ứng dụng.
 * @return {void} Cập nhật control cùng các sự kiện input/change cần thiết.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function syncAlphaTcpaConsent(scopePayload) {
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
  
    const hasTcpa = findControl('#has_tcpa_optin');
    if (hasTcpa) {
      hasTcpa.value = '1';
      hasTcpa.setAttribute('data-checked', 'true');
    }
}
