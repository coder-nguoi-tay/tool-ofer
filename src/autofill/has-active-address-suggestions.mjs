import { markFormRelatedPopups } from './form-scope/mark-form-related-popups.mjs';
/**
 * Kiểm tra xem trên trang web có dropdown gợi ý địa chỉ từ API nào đang mở và hiển thị hay không.
 *
 * @param {object} page Page Playwright.
 * @param {object} [frame=null] Frame Playwright (nếu có).
 * @return {Promise<boolean>} True nếu có menu gợi ý địa chỉ đang mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function hasActiveAddressSuggestions(page, frame = null) {
  // Kiểm tra cả frame và top-level page vì Google Places gắn .pac-container lên document.body của top page
  const formScope = (frame || page)?._activeAutofillFormScope;
  if (formScope) await (frame || page).evaluate(markFormRelatedPopups, formScope).catch(() => {});
  const targets = (formScope ? [frame || page] : [page, frame]).filter(c => c && typeof c.evaluate === 'function');
  const seenTargets = new Set();
  for (const target of targets) {
    if (seenTargets.has(target)) continue;
    seenTargets.add(target);
    try {
      const res = await target.evaluate(scopeSelector => {
        if (typeof document === 'undefined') return false;
        /**
         * Chỉ xét control hiển thị thuộc form hoặc khảo sát đang xử lý.
         * @param {Element} el Phần tử cần kiểm tra.
         * @return {boolean} Phần tử hợp lệ trong phạm vi hiện tại.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-10
         */
        const isVisible = el => {
          if (!el || el.disabled || scopeSelector && !el.matches(scopeSelector)) return false;
          const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
          if (s && (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0')) return false;
          const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
          return r ? r.width > 0 && r.height > 0 : true;
        };
        const containers = ['.pac-container', '.pca', '.ui-autocomplete', '[role="listbox"]', '.select2-dropdown', '.mapboxgl-ctrl-geocoder', '.address-predictions', '.address-results', '[class*="autocomplete-container"]', '[class*="address-dropdown"]', '.loco-dropdown', '.address-suggestions', '[data-testid="address-suggestions"]', '[class*="address-suggestions"]', 'select.address-select', 'select[name*="address" i]', 'select[id*="address" i]', 'select[name*="street" i]', 'select[id*="suggest" i]', 'select[name*="suggest" i]', 'select[name*="verified" i]', '.address-fields select', '.address-group select', 'datalist'];
        for (const c of containers) {
          try {
            for (const el of document.querySelectorAll(c)) {
              if (!isVisible(el)) continue;
              if (el.tagName === 'SELECT' && (!el.options || el.options.length <= 1)) continue;
              return true;
            }
          } catch {}
        }
        return false;
      }, formScope?.memberSelector).catch(() => false);
      if (res === true) return true;
    } catch {}
  }
  return false;
}
export { hasActiveAddressSuggestions };
