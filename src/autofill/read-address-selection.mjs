/**
 * Đọc lựa chọn của widget từ chính ô địa chỉ. Dùng được trong evaluate của Chromium và Obscura.
 * @param {HTMLInputElement} input Ô nhập đang kiểm tra.
 * @param {string} query Địa chỉ nguồn của lượt điền.
 * @return {{display:string,retained:boolean,pending:boolean,attempted?:boolean,requiresSelection:boolean}} Chữ hiện tại và trạng thái để tránh phát lại sự kiện nhập.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
export function readAddressSelection(input, query) {
  const display = input.value || '';
  const result = { display, retained: false, pending: false, requiresSelection: false };
  if (!input.isConnected || !input.matches('input:not([type]), input[type=text], input[type=tel], input[type=search], textarea')) return result;
  const choice = input._autoleadAddressChoice;
  const priorQuery = input._autoleadAddressQuery;
  query ??= priorQuery || choice?.query || display;
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
  const group = input.closest('.form-group, .input-group, .address-fields, .address-group, fieldset') || input.form;
  /**
   * Chỉ gắn mã ẩn cho một ô địa chỉ trong nhóm. Ô email hoặc combobox thành phố có thể ở cùng form.
   * @param {Element|null} owner Nhóm của trường hoặc form liên kết.
   * @return {boolean} Nhóm có đúng một ô có thể sở hữu mã địa chỉ.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-20
   */
  function ownsAddress(owner) {
    if (!owner) return false;
    const controls = owner === input.form ? owner.elements : owner.querySelectorAll('input, textarea');
    return ![...controls].some(peer => {
      if (peer === input || peer.form !== input.form || !peer.matches('input:not([type=hidden]), textarea')) return false;
      const label = (peer.getAttribute('aria-labelledby') || '').split(/\s+/)
        .map(id => peer.ownerDocument.getElementById(id)?.textContent || '').join(' ').trim() ||
        peer.getAttribute('aria-label') || [...(peer.labels || [])].map(item => item.textContent).join(' ');
      const hint = (label || peer.autocomplete || peer.name || peer.id || '').toLowerCase();
      if (/email|e-mail|phone|city|state|province|postal|zip|address-level[12]/.test(hint)) return false;
      return /address|street|địa chỉ/.test(hint) || peer.matches('[role=combobox], [aria-autocomplete], [data-autoleadpc-field=address]');
    });
  }
  const ownsGroup = ownsAddress(group);
  const tokenSelector = 'input[type=hidden]';
  let tokens = [];
  for (const owner of new Set([group, input.form])) {
    if (!owner || !(owner === group ? ownsGroup : ownsAddress(owner))) continue;
    const controls = owner === input.form ? owner.elements : owner.querySelectorAll(tokenSelector);
    tokens = [...controls].filter(item => item.form === input.form && item.matches(tokenSelector) &&
      [item.name, item.id].some(name => /^(placeid|addressid)$/i.test((name || '').replace(/[-_]/g, ''))));
    if (tokens.length) break;
  }
  const references = [input.getAttribute('aria-controls'), input.getAttribute('aria-owns'), input.getAttribute('list')].filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
  const menus = references.map(id => input.ownerDocument.getElementById(id)).filter(Boolean);
  const localMenu = ownsGroup && group.querySelector('.address-suggestions, .address-results, .address-list, .pac-container, select.address-select, select[name*=address i], select[id*=address i]');
  const addressWidget = input.matches('[data-type=address][data-populated]');
  result.requiresSelection = Boolean(addressWidget || tokens.length || choice || localMenu || input.matches('[role=combobox], [aria-autocomplete=list], [aria-autocomplete=both]') ||
    menus.some(menu => menu.matches('select, [role=listbox]')));
  if (!expected || (priorQuery && priorQuery !== query) || (choice && choice.query !== query)) return result;
  result.attempted = Boolean(choice && choice.form === input.form && choice.query === query &&
    (choice.display === display || current && current === normalized(choice.label)));
  const rewritten = Boolean(current && result.requiresSelection && (priorQuery === query || choice?.query === query) && display !== query);
  if (rewritten && (input._autoleadAddressPending?.display !== display || input._autoleadAddressPending.query !== query)) {
    input._autoleadAddressPending = { display, query, since: Date.now() };
  } else if (!rewritten) delete input._autoleadAddressPending;
  const waitingForWidget = rewritten && Date.now() - input._autoleadAddressPending.since < 2500;
  result.pending = waitingForWidget;
  const matchesQuery = (' ' + current + ' ').includes(' ' + expected + ' ');
  const supportsQuery = priorQuery === query || matchesQuery;
  for (const id of references) {
    const list = input.ownerDocument.getElementById(id);
    const listForm = list?.form || list?.closest('form');
    if (!list || listForm && listForm !== input.form || list.closest('footer, header, nav, aside, [role=navigation], [role=contentinfo]')) continue;
    if ([...(input.form?.elements || [])].some(other => other !== input &&
      ['aria-controls', 'aria-owns', 'list'].some(attr => (other.getAttribute(attr) || '').split(/\s+/).includes(id)))) continue;
    if (list.getAttribute('role') === 'listbox' && input.getAttribute('aria-expanded') === 'false') {
      const selected = list.querySelectorAll('[role="option"][aria-selected="true"]');
      if (selected.length === 1) {
        const label = normalized(selected[0].getAttribute('aria-label') || selected[0].textContent);
        if ((' ' + label + ' ').includes(' ' + expected + ' ') && (matchesQuery || current === label)) result.retained = true;
      }
    }
    if (list.localName === 'select' && !list.hasAttribute('multiple') && choice?.item?.closest('select') === list) {
      result.pending = false;
      if (list.selectedIndex < 0 || !list.value || list.options[list.selectedIndex] !== choice.item) continue;
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
  if (tokens.length) {
    const hasId = tokens.length === 1 && Boolean(tokens[0].value.trim());
    const searchClearedAfterChoice = !current && priorQuery === query;
    result.retained = hasId && (result.retained || Boolean(current && matchesQuery) || searchClearedAfterChoice);
    if (result.retained && choice && choice.form === input.form) choice.confirmed = true;
    result.pending = !result.retained && (waitingForWidget || Boolean(hasId && priorQuery === query && current));
  }
  if (addressWidget) {
    // Chỉ widget sở hữu trường này mới xác nhận lựa chọn được API chấp nhận.
    result.retained = input.dataset.populated === 'true' && valid && Boolean(current) &&
      (matchesQuery || result.retained) && (!tokens.length || result.retained);
  }
  if (result.retained && !valid) {
    result.retained = false;
    result.pending = true;
  }
  if (result.retained && choice && choice.form === input.form) choice.confirmed = true;
  return result;
}
