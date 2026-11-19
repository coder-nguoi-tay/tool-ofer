// Bản giải riêng của offer 2615, chép từ src/autofill/select-first-address-suggestion.mjs ngày 2026-11-17. Sửa ở đây không ảnh hưởng giải chung.
import { ADDRESS_SUGGESTION_SELECTORS } from './state/address-suggestion-selectors.mjs';

/**
 * Xác minh form, ô nhập và gợi ý cùng thuộc một tài liệu trước khi tác động.
 * @param {object} context Page hoặc frame chứa ô nhập.
 * @param {object|null} field Locator của ô nhập, hoặc null để nhận diện ô địa chỉ trong form.
 * @param {'inspect'|'select'|'select-native'} action Kiểm tra, chọn gợi ý hoặc chỉ chọn từ select.
 * @param {string} [expectedAddress] Địa chỉ cần đối chiếu với lựa chọn trong select.
 * @return {Promise<{success:boolean,text?:string}>} Kết quả kiểm tra hoặc chọn gợi ý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function resolveAddressSuggestion(context, field, action, expectedAddress = '') {
  const scope = context?._activeAutofillFormScope;
  if (!scope?.rootSelector || !scope.memberSelector || scope.active === false || scope.unavailable) return { success: false };
  let handle;
  try {
    if (field) {
      handle = await field.elementHandle({ timeout: 500 });
      if (!handle) return { success: false };
    }
    return await context.evaluate(({ scope, input, selectors, action, expectedAddress }) => {
      const root = document.querySelector(scope.rootSelector);
      const outside = 'footer, header, nav, aside, [role="navigation"], [role="contentinfo"], [role="banner"], [role="complementary"], [role="search"], .footer, .site-footer, #footer, .ow-attribution, [data-ux-footer-link], [hidden], [inert], [aria-hidden="true"], [aria-disabled="true"]';
      const visible = element => {
        if (!element?.isConnected || element.closest(outside) || element.matches(':disabled') || !element.getClientRects().length) return false;
        for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        }
        return true;
      };
      if (!visible(root)) return { success: false };
      const addressFields = [...root.querySelectorAll('input:not([type]), input[type="text"], input[type="search"], textarea')].filter(element =>
        visible(element) && /address|street|diachi/i.test([element.name, element.id, element.autocomplete, element.placeholder, element.getAttribute('aria-label')].join(' ')));
      if (!input) input = addressFields.includes(document.activeElement) ? document.activeElement : addressFields.length === 1 ? addressFields[0] : null;
      if (action === 'select-native' && !addressFields.includes(input)) return { success: false };
      if (!visible(input) || !root.contains(input) || !input.matches(scope.memberSelector) ||
          root.matches('form') && input.form !== root) return { success: false };
      const menuIds = field => ['aria-controls', 'aria-owns', 'list'].flatMap(attribute => (field.getAttribute(attribute) || '').split(/\s+/)).filter(Boolean);
      const references = menuIds(input);
      if (references.length && [...document.querySelectorAll('input, select, textarea')].some(other =>
        other !== input && menuIds(other).some(id => references.includes(id)) && visible(other))) return { success: false };
      const menus = references.map(id => document.getElementById(id)).filter(Boolean);
      if (references.length && !menus.length) return { success: false };
      const areas = menus.length ? menus : [root];
      const fieldGroup = input.closest('.address-fields, .address-group, .input-group-address, .form-group, .input-group');
      const owned = element => {
        const form = element.closest('form');
        if (form && form !== input.form || element.form && element.form !== input.form || element.closest(outside)) return false;
        const labelControl = element.closest('label')?.control;
        if (labelControl && labelControl !== input) return false;
        if (references.length) return menus.some(menu => menu === element || menu.contains(element));
        if (!root.contains(element)) return false;
        if (fieldGroup?.contains(element) && fieldGroup.querySelectorAll('input:not([type="hidden"]), textarea').length === 1) return true;
        return addressFields.length === 1 && addressFields[0] === input && Boolean(element.closest(
          '.pac-container, .address-suggestions, .address-results, .address-predictions, .address-list, [data-testid="address-suggestions"], select.address-select, select[name*="address" i], select[id*="address" i], select[name*="street" i], select[id*="street" i]'
        ));
      };
      const normalize = text => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
      const expected = normalize(expectedAddress || input.value);
      for (const selector of selectors) {
        const candidates = areas.flatMap(area => [...area.querySelectorAll(selector)]).filter(item => {
          if (!owned(item) || item.closest('a[href]:not([href="#"]):not([href=""])') || item.closest('button:not([type="button"])')?.form) return false;
          if (item.tagName === 'OPTION') {
            const select = item.closest('select');
            return !item.disabled && !item.closest('optgroup[disabled]') && item.value &&
              (select ? visible(select) && (!select.form || select.form === input.form) : input.list && item.parentElement === input.list);
          }
          return action !== 'select-native' && visible(item);
        });
        if (!candidates.length) continue;
        const matching = expected ? candidates.filter(item =>
          (' ' + normalize(item.getAttribute('data-street_line') || item.textContent || item.value) + ' ').includes(' ' + expected + ' ')) : candidates;
        if (matching.length !== 1) return { success: false };
        const item = matching[0];
        const text = (item.textContent || item.value || '').trim();
        const prior = input._autoleadAddressChoice;
        const sameOption = item.tagName === 'OPTION' && item.closest('select') && item.selected;
        const sameChoice = prior?.item === item && prior.form === input.form && prior.display === input.value &&
          input.getAttribute('aria-invalid') !== 'true' && input.validity?.valid !== false &&
          (item.getAttribute('aria-selected') === 'true' || prior.display !== prior.query || input.getAttribute('aria-expanded') === 'false');
        if (sameOption || sameChoice) return { success: action !== 'inspect', text, retained: true };
        if (action === 'inspect') return { success: true };
        const query = expectedAddress || input.value;
        const choice = { query, label: text, item, form: input.form, display: input.value };
        if (item.tagName === 'OPTION') {
          const select = item.closest('select');
          if (action === 'select-native' && (!select || !expected)) return { success: false };
          const target = select || input;
          target.value = item.value;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
          choice.display = input.value;
          input._autoleadAddressChoice = choice;
          return { success: true, text };
        }
        item.scrollIntoView({ block: 'nearest' });
        const rect = item.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        if (!item.contains(hit) || hit.closest('a[href], button') !== item.closest('a[href], button')) return { success: false };
        item.click();
        choice.display = input.value;
        input._autoleadAddressChoice = choice;
        return { success: true, text };
      }
      return { success: false };
    }, { scope, input: handle || null, selectors: ADDRESS_SUGGESTION_SELECTORS, action, expectedAddress });
  } catch {
    return { success: false };
  } finally {
    await handle?.dispose().catch(() => {});
  }
}

/**
 * Chỉ chọn gợi ý địa chỉ xác minh được trong tài liệu của trường đang điền.
 * @param {object} page Page Playwright.
 * @param {object|null} [frame] Frame sở hữu trường.
 * @param {object|null} [field] Locator trường đang điền.
 * @param {object} [options] Callback ghi nhận thao tác.
 * @return {Promise<boolean>} Đã chọn đúng một mục.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export async function selectFirstAddressSuggestion(page, frame = null, field = null, options = {}) {
  const result = await resolveAddressSuggestion(frame || page, field, 'select');
  if (result.success && !result.retained) options.onLog?.({ type: 'address_suggestion_selected', detail: '[Address Autocomplete] Đã chọn gợi ý trong form đang điền.' }, page);
  return result.success;
}
