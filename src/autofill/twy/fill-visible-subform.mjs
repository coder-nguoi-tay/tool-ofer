/**
 * Đồng bộ dữ liệu liên hệ trong subform Twy đã hiển thị sau khi opt in.
 * @param {object} args Phạm vi form và dữ liệu của widget Twy.
 * @return {number} Số trường thực sự được thay đổi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function fillVisibleTwySubform(args) {
    const vals = args.vals;
    const filledFields = [];
    /**
     * Giới hạn control trong scope, đồng thời xét visibility của toàn bộ tổ tiên.
     * @param {Element} element Phần tử widget cần kiểm tra.
     * @return {boolean} Phần tử thực sự hiển thị và không bị khóa.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-11
     */
    const inScope = element => {
      if (!element || args.formScope && !element.matches(args.formScope.memberSelector)) return false;
      for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (ancestor.hidden || ancestor.hasAttribute('inert') || style.display === 'none' || ['hidden', 'collapse'].includes(style.visibility) || style.opacity === '0') return false;
      }
      return element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
    };
    const optedIn = Array.from(document.querySelectorAll('input.twy-opt-yes:checked, input[id*="twyinputyes-"]:checked')).some(input => input.closest('[class*="twy-campaign-container"], [id^="twy-campaign"]:not([id^="twy-campaigns"])') && inScope(input.closest('[class*="twy-campaign-container"], [id^="twy-campaign"]:not([id^="twy-campaigns"])')));
    if (!optedIn) return 0;
    // Bước B+: nếu có thẻ đã chọn Yes mà subform co-reg (ẨN NGOÀI card) còn trống → điền.
    // Quét toàn trang các input/select có twyfieldtype — vì subform không nằm trong thẻ con.
    const twyInputs = Array.from(document.querySelectorAll('input[twyfieldtype], select[twyfieldtype]'));
    /**
     * Ánh xạ field type của widget sang dữ liệu liên hệ hiện có, không xóa trường khi thiếu dữ liệu.
     * @param {string} ft Loại trường do widget khai báo.
     * @return {string} Giá trị liên hệ hoặc chuỗi rỗng khi không có dữ liệu tương ứng.
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-11
     */
    const fillMap = ft => {
      if (/first/.test(ft)) return vals.first;
      if (/last/.test(ft)) return vals.last;
      if (/email/.test(ft)) return vals.email;
      if (/zip|postal/.test(ft)) return vals.zip;
      if (/phone|tel/.test(ft)) return vals.phone;
      if (/dob|birth/.test(ft)) return vals.dob;
      if (/address/.test(ft)) return vals.address;
      if (/city/.test(ft)) return vals.city;
      if (/state/.test(ft)) return vals.state;
      return '';
    };
    {
      for (const inp of twyInputs) {
        const ft = (inp.getAttribute('twyfieldtype') || inp.name || '').toLowerCase();
        if (!inScope(inp)) continue;
        // Câu hỏi tùy chỉnh cq1/cq2...: chọn ngẫu nhiên một lựa chọn (không phải placeholder "None")
        // — đây là loại câu hỏi khiến Continue bị chặn td validation khi chưa chọn.
        if (/^cq\d+$/.test(ft)) {
          if (inp.tagName === 'SELECT') {
            if (inp.value) continue; // đã chọn
            const opts = Array.from(inp.options).filter(o => o.value && !/none of the above/i.test(o.text));
            const pool = opts.length > 0 ? opts : Array.from(inp.options).filter(o => o.value);
            if (pool.length > 0) {
              const chosen = pool[Math.floor(Math.random() * pool.length)];
              inp.value = chosen.value;
              inp.dispatchEvent(new Event('input', {
                bubbles: true
              }));
              inp.dispatchEvent(new Event('change', {
                bubbles: true
              }));
              filledFields.push(inp.name || inp.id);
            }
          }

          continue;
        }
        const fillVal = fillMap(ft);
        if (!fillVal || inp.disabled || inp.readOnly) continue;
        if (inp.tagName === 'SELECT') {
          const opt = Array.from(inp.options).find(o => String(o.value).toLowerCase() === fillVal.toLowerCase() || String(o.text).toLowerCase().includes(fillVal.toLowerCase()));
          if (opt && inp.value !== opt.value) {
            inp.value = opt.value;
            inp.dispatchEvent(new Event('change', {
              bubbles: true
            }));
            filledFields.push(inp.name || inp.id);
          }
        } else if (inp.type === 'checkbox' || inp.type === 'radio') {
          continue;
        } else if (inp.value !== fillVal) {
          inp.value = fillVal;
          inp.dispatchEvent(new Event('input', {
            bubbles: true
          }));
          inp.dispatchEvent(new Event('change', {
            bubbles: true
          }));
          filledFields.push(inp.name || inp.id);
        }
      }
    }


    return filledFields.length;
}
