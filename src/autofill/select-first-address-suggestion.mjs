import { markFormRelatedPopups } from './form-scope/mark-form-related-popups.mjs';
import { locateFormElements } from './form-scope/locate-form-elements.mjs';
import { ADDRESS_SUGGESTION_SELECTORS } from './state/address-suggestion-selectors.mjs';

/**
 * Tự động tìm và chọn phần tử gợi ý địa chỉ đầu tiên từ danh sách API của trang web.
 * Hỗ trợ Google Places, Loqate, Mapbox, Algolia, ARIA listbox, thẻ select động và custom dropdowns.
 *
 * @param {object} page Page Playwright.
 * @param {object} [frame=null] Frame Playwright.
 * @param {object} [field=null] Locator ô input địa chỉ (dùng cho fallback keyboard).
 * @param {object} [options={}] Tùy chọn log.
 * @return {Promise<boolean>} True khi thao tác chọn gợi ý đã thực hiện thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function selectFirstAddressSuggestion(page, frame = null, field = null, options = {}) {
  const formScope = (frame || page)?._activeAutofillFormScope;
  if (formScope) await (frame || page).evaluate(markFormRelatedPopups, formScope).catch(() => {});
  const contexts = (formScope ? [frame || page] : [page, frame]).filter(c => c && (typeof c.evaluate === 'function' || typeof c.locator === 'function'));
  const seenContexts = new Set();
  for (const ctx of contexts) {
    if (seenContexts.has(ctx)) continue;
    seenContexts.add(ctx);
    try {
      let clickRes = null;
      if (typeof ctx.evaluate === 'function') {
        clickRes = await ctx.evaluate(payload => {
          const selectors = Array.isArray(payload) ? payload : payload.selectors;
          const scopeSelector = Array.isArray(payload) ? null : payload.scopeSelector;
          if (typeof document === 'undefined') return null;
          const isVisible = el => {
            if (!el || el.disabled) return false;
            const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
            if (s && (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0')) return false;
            const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
            return r ? r.width > 0 && r.height > 0 : true;
          };
          for (const sel of selectors) {
            try {
              const allItems = Array.from(document.querySelectorAll(sel));
              const visibleItems = allItems.filter(el => (!scopeSelector || el.matches(scopeSelector)) && (isVisible(el) || el.tagName === 'OPTION'));
              if (visibleItems.length === 0) continue;

              // Random chọn kết quả số 1 (index 0) hoặc số 2 (index 1) nếu có từ 2 kết quả trở lên để tránh spam đáp án giống nhau liên tục
              const targetIdx = visibleItems.length >= 2 && Math.random() < 0.5 ? 1 : 0;
              const item = visibleItems[targetIdx];
              if (!item) continue;

              // XỬ LÝ ĐẶC BIỆT KHI KẾT QUẢ TRẢ VỀ LÀ THẺ <SELECT> / <OPTION> (ô vừa input vừa select)
              if (item.tagName === 'OPTION') {
                const select = item.closest('select');
                if (select) {
                  select.value = item.value;
                  item.selected = true;
                  select.selectedIndex = Array.from(select.options).indexOf(item);
                  select.dispatchEvent(new Event('input', {
                    bubbles: true
                  }));
                  select.dispatchEvent(new Event('change', {
                    bubbles: true
                  }));
                  select.dispatchEvent(new Event('blur', {
                    bubbles: true
                  }));
                  return {
                    success: true,
                    selector: sel,
                    text: (item.textContent || item.innerText || item.value || '').trim().slice(0, 50)
                  };
                }
                const datalist = item.closest('datalist');
                if (datalist && datalist.id) {
                  const input = document.querySelector(`input[list="${datalist.id}"]`);
                  if (input) {
                    input.value = item.value || item.textContent || '';
                    input.dispatchEvent(new Event('input', {
                      bubbles: true
                    }));
                    input.dispatchEvent(new Event('change', {
                      bubbles: true
                    }));
                    input.dispatchEvent(new Event('blur', {
                      bubbles: true
                    }));
                    return {
                      success: true,
                      selector: sel,
                      text: input.value.slice(0, 50)
                    };
                  }
                }
              }
              item.scrollIntoView?.({
                block: 'nearest'
              });
              // Kích hoạt chuỗi sự kiện chuột hoàn chỉnh cho React (onMouseDown), Loqate, Google Places, Vanilla listeners
              item.dispatchEvent(new MouseEvent('pointerdown', {
                bubbles: true,
                cancelable: true
              }));
              item.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true
              }));
              item.dispatchEvent(new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true
              }));
              item.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true
              }));
              item.click?.();

              // Đồng bộ thẻ ẩn #input-address nếu có trên AlphaIntent / LaunchPotato
              try {
                const hiddenAddr = document.getElementById('input-address') || document.querySelector('input[data-testid="input-address"]');
                const fullText = (item.textContent || item.innerText || item.getAttribute('data-street_line') || '').trim();
                if (hiddenAddr && fullText) {
                  hiddenAddr.value = fullText;
                  hiddenAddr.dispatchEvent(new Event('input', {
                    bubbles: true
                  }));
                  hiddenAddr.dispatchEvent(new Event('change', {
                    bubbles: true
                  }));
                }
              } catch {}
              return {
                success: true,
                selector: sel,
                text: (item.textContent || item.innerText || '').trim().slice(0, 50)
              };
            } catch {}
          }
          return {
            success: false
          };
        }, formScope ? { selectors: ADDRESS_SUGGESTION_SELECTORS, scopeSelector: formScope.memberSelector } : ADDRESS_SUGGESTION_SELECTORS).catch(() => null);
      }
      if (clickRes?.success) {
        options.onLog?.({
          type: 'address_suggestion_selected',
          detail: `[Address Autocomplete] Đã tự động chọn gợi ý địa chỉ đầu tiên từ API: [${(clickRes.text || clickRes.selector).slice(0, 40)}]`
        }, page);
        return true;
      }

      // Mock / Unit test fallback: Khi chạy trên môi trường test không có DOM thật (evaluate trả về boolean/null)
      if ((!clickRes || clickRes.success === undefined) && typeof ctx.locator === 'function') {
        for (const sel of ADDRESS_SUGGESTION_SELECTORS) {
          try {
            const loc = locateFormElements(ctx, sel);
            const count = await loc.count().catch(() => 0);
            if (count > 0) {
              const targetIdx = count >= 2 && Math.random() < 0.5 ? 1 : 0;
              const item = loc.nth(targetIdx);
              const visible = await item.isVisible({
                timeout: 100
              }).catch(() => false);
              if (visible) {
                let suggestionSelected = await item.evaluate?.(el => {
                  if (el.tagName === 'OPTION') {
                    const select = el.closest('select');
                    if (select) {
                      select.value = el.value;
                      el.selected = true;
                      select.dispatchEvent(new Event('input', {
                        bubbles: true
                      }));
                      select.dispatchEvent(new Event('change', {
                        bubbles: true
                      }));
                      return true;
                    }
                  }
                  el.scrollIntoView?.({
                    block: 'nearest'
                  });
                  el.dispatchEvent(new MouseEvent('pointerdown', {
                    bubbles: true,
                    cancelable: true
                  }));
                  el.dispatchEvent(new MouseEvent('mousedown', {
                    bubbles: true,
                    cancelable: true
                  }));
                  el.click?.();
                  return true;
                }).catch(() => false);
                if (!suggestionSelected) {
                  suggestionSelected = await item.click?.({
                    force: true,
                    timeout: 300
                  }).then(() => true).catch(() => false);
                }
                if (!suggestionSelected) continue;
                options.onLog?.({
                  type: 'address_suggestion_selected',
                  detail: `[Address Autocomplete] Đã chọn gợi ý địa chỉ: [${sel.slice(0, 40)}]`
                }, page);
                return true;
              }
            }
          } catch {}
        }
      }
    } catch {}
  }
  return false;
}
export { selectFirstAddressSuggestion };
