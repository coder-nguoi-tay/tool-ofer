/**
 * Đọc lựa chọn của widget từ chính ô địa chỉ. Dùng được trong evaluate của Chromium và Obscura.
 * @param {HTMLInputElement} input Ô nhập đang kiểm tra.
 * @param {string} query Địa chỉ nguồn của lượt điền.
 * @return {{display:string,retained:boolean,pending:boolean}} Chữ hiện tại và trạng thái để tránh phát lại sự kiện nhập.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
export function readAddressSelection(input, query) {
  const display = input.value || '';
  const result = { display, retained: false, pending: false };
  if (!input.isConnected || !input.matches('input:not([type]), input[type=text], input[type=search], textarea')) return result;
  const choice = input._autoleadAddressChoice;
  const priorQuery = input._autoleadAddressQuery;
  if ((priorQuery && priorQuery !== query) || (choice && choice.query !== query)) return result;
  /**
   * Chuẩn hóa ranh giới từ để không nhầm số nhà 10 với 110.
   * @param {string} text Giá trị truy vấn hoặc nhãn được chọn.
   * @return {string} Chuỗi từ dùng để so khớp địa chỉ.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-19
   */
  const normalized = text => String(text || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    .replace(/\b(street|road|avenue|boulevard|lane|drive)\b/g, word =>
      ({ street: 'st', road: 'rd', avenue: 'ave', boulevard: 'blvd', lane: 'ln', drive: 'dr' })[word]);
  const current = normalized(display);
  const expected = normalized(query);
  const valid = input.getAttribute('aria-invalid') !== 'true' && input.validity?.valid !== false;
  const widget = input.matches('[aria-autocomplete], [role=combobox], [aria-controls], [aria-owns], [list], .autocomplete, .typeahead');
  if (!expected) return result;
  const rewritten = Boolean(current) && widget && priorQuery === query && display !== query;
  result.pending = Boolean(rewritten && valid);
  if (!valid) return result;
  const references = [input.getAttribute('aria-controls'), input.getAttribute('aria-owns'), input.getAttribute('list')].filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
  const matchesQuery = (' ' + current + ' ').includes(' ' + expected + ' ');
  const supportsQuery = priorQuery === query || matchesQuery;
  for (const id of references) {
    const list = input.ownerDocument.getElementById(id);
    if (!list || (list.form && list.form !== input.form)) continue;
    if ([...(input.form?.elements || [])].some(other => other !== input &&
      ['aria-controls', 'aria-owns', 'list'].some(attr => (other.getAttribute(attr) || '').split(/\s+/).includes(id)))) continue;
    if (list.getAttribute('role') === 'listbox' && input.getAttribute('aria-expanded') === 'false') {
      const selected = list.querySelectorAll('[role="option"][aria-selected="true"]');
      if (selected.length === 1) {
        const label = normalized(selected[0].getAttribute('aria-label') || selected[0].textContent);
        if ((' ' + label + ' ').includes(' ' + expected + ' ') && (matchesQuery || current === label)) result.retained = true;
      }
    }
    if (list.localName === 'select' && !list.hasAttribute('multiple')) {
      result.pending = false;
      if (list.selectedIndex < 0 || !list.value) continue;
      const selected = list.options[list.selectedIndex];
      const label = normalized(selected?.textContent || selected?.value);
      if ((' ' + label + ' ').includes(' ' + expected + ' ') && (supportsQuery || current === label)) result.retained = true;
    }
  }
  if (current && choice?.item && choice.form === input.form) {
    const nativeSelect = choice.item.closest('select');
    const accepted = nativeSelect ? nativeSelect.isConnected && nativeSelect.value && choice.item.selected :
      input.getAttribute('aria-expanded') !== 'true' && (!choice.item.isConnected || !choice.item.getClientRects().length ||
        choice.item.getAttribute('aria-selected') === 'true' || display !== choice.query || choice.item.closest('datalist'));
    if (accepted && (display === choice.display || current === normalized(choice.label) || supportsQuery && current.startsWith(expected + ' '))) result.retained = true;
  }
  if (widget && (supportsQuery || result.retained)) {
    const group = input.closest('.form-group, .input-group, .address-fields, .address-group, fieldset') || input.form;
    if (group) {
      const peers = [...group.querySelectorAll('input:not([type=hidden]), textarea')].filter(item => item === input ||
        item.matches('[role=combobox], [aria-autocomplete], [autocomplete=street-address], [name*=address i], [name*=street i]'));
      const ids = [...group.querySelectorAll('input[type=hidden]')].filter(item => item.form === input.form &&
        /^(placeid|addressid)$/i.test((item.name || item.id || '').replace(/[-_]/g, '')));
      if (peers.length === 1 && peers[0] === input && ids.length === 1) {
        const hasId = Boolean(ids[0].value.trim());
        result.retained = hasId && (result.retained || matchesQuery || (!current && priorQuery === query));
        result.pending = hasId && !result.retained && priorQuery === query;
      }
    }
  }
  return result;
}
