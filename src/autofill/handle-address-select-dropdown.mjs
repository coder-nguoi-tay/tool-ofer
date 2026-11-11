/**
 * Tự động phát hiện và chọn địa chỉ từ thẻ <select> trả về sau khi gõ địa chỉ (ô vừa input vừa select).
 *
 * @param {object} frame Frame Playwright.
 * @param {object} [record={}] Bản ghi thông tin người dùng.
 * @return {Promise<{success:boolean,text?:string}>} Kết quả chọn select.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleAddressSelectDropdown(frame, record = {}) {
  if (!frame || typeof frame.evaluate !== 'function') return {
    success: false
  };
  try {
    const res = await frame.evaluate(rec => {
      const isVisible = el => {
        if (!el || el.disabled) return false;
        const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (s && (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0')) return false;
        return Boolean(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
      };
      const selectCandidates = Array.from(document.querySelectorAll('select.address-select, select[name*="address" i], select[id*="address" i], select[name*="street" i], select[id*="street" i], select[id*="suggest" i], select[name*="suggest" i], select[name*="verified" i], select[id*="verified" i], .address-fields select, .address-group select, .input-group-address select')).filter(isVisible);
      if (selectCandidates.length === 0) {
        const addrInput = document.querySelector('input#address, input[name*="address" i], input[data-testid="address-input"]');
        if (addrInput) {
          const container = addrInput.closest('.form-group, .input-group, .address-fields, form, div');
          if (container) {
            const sels = Array.from(container.querySelectorAll('select')).filter(isVisible);
            selectCandidates.push(...sels);
          }
        }
      }
      for (const sel of selectCandidates) {
        if (!sel.options || sel.options.length <= 1) continue;
        const isStateOnly = /^(state|province|tinh)$/i.test(sel.name || sel.id || '');
        if (isStateOnly && sel.value && sel.value !== '') continue;
        const validOpts = Array.from(sel.options).slice(1).filter(o => o.value && !o.disabled && !/select|choose/i.test(o.text));
        if (validOpts.length === 0) continue;
        const targetAddr = String(rec.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const targetCity = String(rec.city || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const matchingOpts = validOpts.filter(opt => {
          const optText = String(opt.text || opt.label || opt.value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return targetAddr && optText.includes(targetAddr) || targetCity && optText.includes(targetCity);
        });
        const pool = matchingOpts.length > 0 ? matchingOpts : validOpts;
        // Random chọn kết quả số 1 (index 0) hoặc số 2 (index 1) nếu có từ 2 kết quả trở lên để tránh spam đáp án giống nhau
        const chosenIdx = pool.length >= 2 && Math.random() < 0.5 ? 1 : 0;
        const bestOpt = pool[chosenIdx];
        if (bestOpt) {
          sel.value = bestOpt.value;
          bestOpt.selected = true;
          sel.selectedIndex = Array.from(sel.options).indexOf(bestOpt);
          sel.dispatchEvent(new Event('input', {
            bubbles: true
          }));
          sel.dispatchEvent(new Event('change', {
            bubbles: true
          }));
          sel.dispatchEvent(new Event('blur', {
            bubbles: true
          }));
          return {
            success: true,
            text: (bestOpt.text || bestOpt.value || '').trim()
          };
        }
      }
      return {
        success: false
      };
    }, record).catch(() => ({
      success: false
    }));
    return res || {
      success: false
    };
  } catch {
    return {
      success: false
    };
  }
}
export { handleAddressSelectDropdown };
