/**
 * Phân tích và xử lý các câu hỏi Khảo sát dạng Dropdown selection (Select tiêu chuẩn và Custom Listbox).
 * Tự động nhận diện dropdown đang ở trạng thái placeholder / chưa chọn và chọn 1 option hợp lệ.
 *
 * @param {object} frame Frame hoặc Page Playwright.
 * @param {object} [options={}] Tùy chọn.
 * @return {Promise<number>} Số câu hỏi dropdown đã được chọn thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function solveDropdownQuestions(frame, options = {}) {
  let answered = 0;
  try {
    const dropdownGroups = await frame.evaluate(scopeSelector => {
      /**
       * Chỉ xét control hiển thị thuộc form hoặc khảo sát đang xử lý.
       * @param {Element} el Phần tử cần kiểm tra.
       * @return {boolean} Phần tử hợp lệ trong phạm vi hiện tại.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-11
       */
      const isVisible = el => {
        if (scopeSelector && !el?.matches(scopeSelector)) return false;
        if (!el || el.disabled) return false;
        const s = window.getComputedStyle ? window.getComputedStyle(el) : null;
        if (s && (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0')) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const groups = [];
      const selects = Array.from(document.querySelectorAll('select')).filter(isVisible);
      selects.forEach((sel, idx) => {
        if (!sel.options || sel.options.length < 2) return;
        const identity = [sel.id, sel.name, sel.getAttribute('autocomplete'), ...Array.from(sel.labels || []).map(label => label.textContent)].join(' ');
        if (/state|province|country|gender|title|salutation|birth|dob|email|phone|address|(?:^|[^a-z])(age|month|day|year|city|zip)(?:$|[^a-z])/i.test(identity)) return;
        const curOpt = sel.options[sel.selectedIndex];
        const curVal = String(curOpt?.value ?? '').trim().toLowerCase();
        const curTxt = String(curOpt?.text ?? '').trim().toLowerCase();
        const isPlaceholder = !curVal || /^(0|-1|none|placeholder|default|select)$/i.test(curVal) || /^(select|choose|chọn|vui lòng|pick|--|\.\.\.|please select)/i.test(curTxt);
        if (isPlaceholder) {
          const uid = `survey_sel_${idx}_${Date.now()}`;
          sel.setAttribute('data-survey-dropdown-uid', uid);
          groups.push({
            uid,
            kind: 'native_select'
          });
        }
      });
      return groups;
    }, frame._activeAutofillFormScope?.memberSelector).catch(() => []);
    if (options.pickRandom === false) return 0;
    for (const item of dropdownGroups) {
      try {
        const loc = frame.locator(`[data-survey-dropdown-uid="${item.uid}"]`).first();
        if ((await loc.count()) > 0) {
          const picked = await loc.evaluate(sel => {
            const valid = Array.from(sel.options).filter(o => {
              const val = String(o.value ?? '').trim().toLowerCase();
              const txt = String(o.text ?? '').trim().toLowerCase();
              if (!val || /^(0|-1|none|placeholder|default|select)$/i.test(val)) return false;
              if (/^(select|choose|chọn|vui lòng|pick|--|\.\.\.|please select)/i.test(txt)) return false;
              return !o.disabled;
            });
            if (valid.length > 0) {
              const target = valid[Math.floor(Math.random() * valid.length)];
              sel.value = target.value;
              sel.dispatchEvent(new Event('input', {
                bubbles: true
              }));
              sel.dispatchEvent(new Event('change', {
                bubbles: true
              }));
              sel.dispatchEvent(new Event('blur', {
                bubbles: true
              }));
              if (sel.value !== target.value) return false;
              sel.setAttribute('data-survey-dropdown-filled', '1');
              return true;
            }
            return false;
          }).catch(() => false);
          if (picked) answered++;
        }
      } catch {}
    }
  } catch {}
  return answered;
}
export { solveDropdownQuestions };
