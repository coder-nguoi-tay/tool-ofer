import { shouldStopAfterLead } from './should-stop-after-lead.mjs';
import { readAddressSelection } from './read-address-selection.mjs';
import { collectFieldMetadata } from './collect-field-metadata.mjs';
import { locateFormElements } from './form-scope/locate-form-elements.mjs';
import { resolveContactField } from './resolve-contact-field.mjs';
import { ADDRESS_SUGGESTION_SELECTORS } from './state/address-suggestion-selectors.mjs';

/**
 * Xác minh form, ô nhập và gợi ý cùng thuộc một tài liệu trước khi tác động.
 * @param {object} context Page hoặc frame chứa ô nhập.
 * @param {object|null} field Locator của ô nhập, hoặc null để nhận diện ô địa chỉ trong form.
 * @param {'inspect'|'select'|'select-native'} action Kiểm tra, chọn gợi ý hoặc chỉ chọn từ select.
 * @param {string} [expectedAddress] Địa chỉ cần đối chiếu với lựa chọn trong select.
 * @return {Promise<{success:boolean,text?:string}>} Kết quả kiểm tra hoặc chọn gợi ý.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export async function resolveAddressSuggestion(context, field, action, expectedAddress = '') {
  const scope = context?._activeAutofillFormScope;
  if (!scope?.rootSelector || !scope.memberSelector || scope.active === false || scope.unavailable) return { success: false };
  let handle;
  let decision;
  try {
    if (!field) {
      const candidates = locateFormElements(context, 'input:not([type]), input[type=text], input[type=tel], input[type=search], textarea', scope);
      const addresses = [];
      for (const candidate of await candidates.filter({ visible: true }).all()) {
        const metadata = await candidate.evaluate(collectFieldMetadata);
        if (resolveContactField(metadata) === 'address') addresses.push(candidate);
      }
      if (addresses.length === 1) field = addresses[0];
      else for (const candidate of addresses) {
        if (await candidate.evaluate(input => input === input.ownerDocument.activeElement)) field = candidate;
      }
    }
    if (!field) return { success: false };
    handle = await field.elementHandle({ timeout: 500 });
    if (!handle) return { success: false };
    const belongs = await context.evaluate(({ input, scope }) => {
      const root = document.querySelector(scope.rootSelector);
      return root?.contains(input) && input.matches(scope.memberSelector) && (!root.matches('form') || input.form === root);
    }, { input: handle, scope });
    if (!belongs || !await handle.isVisible()) return { success: false };
    const meaning = resolveContactField(await handle.evaluate(collectFieldMetadata));
    if (meaning === 'conflict' || /^phone|^email$/.test(meaning) || action === 'select-native' && meaning !== 'address') return { success: false };
    if (meaning === 'address') {
      const selection = await handle.evaluate(readAddressSelection, expectedAddress || undefined);
      if (selection.retained || selection.pending) return { success: selection.retained && action !== 'inspect', retained: selection.retained };
    }
    /**
     * Tìm gợi ý đầu tiên hợp lệ của ô hiện tại trong chính tài liệu chứa form.
     * @param {object} request Phạm vi, ô nhập và truy vấn địa chỉ.
     * @return {Element|object} Dòng cần click hoặc kết quả kiểm tra DOM.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-20
     */
    const findAddressOption = ({ scope, input, selectors, action, expectedAddress, isAddress }) => {
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
      const normalize = text => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
        .replace(/\b(street|road|avenue|boulevard|lane|drive|north|south|east|west|northeast|northwest|southeast|southwest)\b/g, word =>
          ({ street: 'st', road: 'rd', avenue: 'ave', boulevard: 'blvd', lane: 'ln', drive: 'dr',
             north: 'n', south: 's', east: 'e', west: 'w', northeast: 'ne', northwest: 'nw', southeast: 'se', southwest: 'sw' })[word]);
      const query = expectedAddress || input._autoleadAddressQuery || input.value;
      const expected = normalize(query);
      const selector = selectors.join(',');
      const candidates = [...new Set(areas.flatMap(area => [...area.querySelectorAll(selector)]))].filter(item => {
        if (item.matches('.address-suggestions, .address-results, .address-list, [data-testid=address-suggestions], [role=listbox]')) return false;
        if (!owned(item) || item.closest('a[href]:not([href="#"]):not([href=""])') || item.closest('button:not([type="button"])')?.form) return false;
        if (item.tagName === 'OPTION') {
          const select = item.closest('select');
          return !item.disabled && !item.closest('optgroup[disabled]') && item.value &&
            (select ? visible(select) && (!select.form || select.form === input.form) : input.list && item.parentElement === input.list);
        }
        return action !== 'select-native' && visible(item);
      });
      // Gộp các phần chữ của một lựa chọn và bỏ phần tử cha bao quanh nhiều lựa chọn.
      const eligible = new Set(candidates);
      const choices = new Set(candidates.map(item => {
        const row = item.closest('[role=option], option, .pac-item, .ui-menu-item, .address-item, [data-street_line]');
        return eligible.has(row) ? row : item;
      }));
      for (const item of choices) {
        for (let parent = item.parentElement; parent; parent = parent.parentElement) choices.delete(parent);
      }
      const items = [...choices];
      const matching = expected ? items.filter(item =>
        [item.getAttribute('data-street_line'), item.getAttribute('aria-label'), item.textContent || item.value]
          .some(label => label && (' ' + normalize(label) + ' ').includes(' ' + expected + ' '))) : items;
      if (!matching.length || matching.length > 1 && (!isAddress || !expected)) return { success: false };
      const item = matching[0];
      const text = (item.textContent || item.value || '').trim();
      const prior = input._autoleadAddressChoice;
      const widgetPending = input.matches('[data-type=address][data-populated]') && input.dataset.populated !== 'true';
      if (prior?.item === item && prior.query === query && prior.form === input.form && prior.label === text &&
          !prior.confirmed && (widgetPending || input.getAttribute('aria-expanded') === 'true')) return { success: false };
      const sameOption = item.tagName === 'OPTION' && item.closest('select') && item.selected && prior?.item === item && prior.form === input.form && prior.query === query;
      const sameChoice = prior?.item === item && prior.form === input.form && prior.display === input.value &&
        input.getAttribute('aria-invalid') !== 'true' && input.validity?.valid !== false &&
        (item.getAttribute('aria-selected') === 'true' || prior.display !== prior.query || input.getAttribute('aria-expanded') === 'false');
      const owner = fieldGroup || input.form;
      const tokens = [...(owner?.querySelectorAll('input[type=hidden]') || [])].filter(token =>
        token.form === input.form && [token.name, token.id].some(name => /^(placeid|addressid)$/i.test((name || '').replace(/[-_]/g, ''))));
      const hasToken = tokens.length === 1 && Boolean(tokens[0].value.trim());
      if (hasToken && item.tagName === 'OPTION' && item.selected && addressFields.length === 1 && addressFields[0] === input) {
        if (prior) prior.confirmed = true;
        return { success: action !== 'inspect' && input.getAttribute('aria-invalid') !== 'true', text, retained: true };
      }
      const lostToken = tokens.length && !hasToken && prior?.confirmed;
      if (!lostToken && (sameOption || sameChoice)) {
        const confirmed = (!tokens.length || hasToken) && input.getAttribute('aria-invalid') !== 'true';
        if (hasToken) prior.confirmed = true;
        return { success: confirmed && action !== 'inspect', text, retained: confirmed };
      }
      if (action === 'inspect') return { success: true };
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
        choice.confirmed = tokens.length === 1 && Boolean(tokens[0].value.trim());
        return { success: !tokens.length || choice.confirmed, text };
      }
      item.scrollIntoView({ block: 'nearest' });
      const rect = item.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!item.contains(hit) || hit.closest('a[href], button') !== item.closest('a[href], button')) return { success: false };
      // Giữ đúng dòng đã kiểm tra qua lượt click, kể cả khi widget thay danh sách lúc nhấn chuột.
      input._autoleadAddressChoice = choice;
      return item;
    };
    const request = { scope, input: handle, selectors: ADDRESS_SUGGESTION_SELECTORS, action, expectedAddress, isAddress: meaning === 'address' };
    const page = typeof context.page === 'function' ? context.page() : context;
    if (action !== 'inspect' && (page._manualCaptchaPending || shouldStopAfterLead(page._autofillSession))) return { success: false };
    if (action !== 'select') return await context.evaluate(findAddressOption, request);
    decision = await context.evaluateHandle(findAddressOption, request);
    const option = decision.asElement();
    if (!option) return await decision.jsonValue();
    const clicked = !page._manualCaptchaPending && !shouldStopAfterLead(page._autofillSession) &&
      await option.click({ timeout: 1000 }).then(() => true, () => false);
    if (!clicked) {
      await handle.evaluate((input, item) => {
        if (input._autoleadAddressChoice?.item === item) delete input._autoleadAddressChoice;
      }, option).catch(() => {});
      return { success: false };
    }
    const text = await handle.evaluate((input, item) => {
      const choice = input._autoleadAddressChoice;
      if (choice?.item !== item) return '';
      choice.display = input.value;
      return choice.label;
    }, option).catch(() => '');
    return { success: true, text };
  } catch {
    return { success: false };
  } finally {
    await decision?.dispose().catch(() => {});
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
