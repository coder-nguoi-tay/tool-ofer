/**
 * Chụp trạng thái form để phân biệt chưa điền, bị khóa, lỗi validation và đã ẩn.
 * Hàm tự chứa để chạy trong frame; không thu giá trị người dùng nhập.
 * @return {object} Trạng thái tải, form, trường và nút tại thời điểm chụp.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function inspectFormState() {
  /**
   * Tạo dấu chữ giao diện để nhận bước iframe mới mà không ghi nhãn hoặc giá trị nhập vào log.
   * @param {string} text Nhãn control hoặc nội dung câu hỏi.
   * @return {string} Dấu nội dung dùng so trạng thái, không dùng cho bảo mật.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const textSignature = text => {
    let hash = 2166136261;
    for (const character of text.replace(/\s+/g, ' ').trim()) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    return (hash >>> 0).toString(16);
  };
  /**
   * Mô tả mức sẵn sàng của trường/nút, không đọc nội dung dữ liệu để lưu log.
   * @param {Element} element Trường hoặc nút cần kiểm tra.
   * @return {object} Định danh và trạng thái hiển thị/validation.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-12
   */
  const describeControl = element => {
    const bounds = element.getBoundingClientRect();
    let visible = bounds.width > 0 && bounds.height > 0;
    for (let ancestor = element; ancestor; ancestor = ancestor.parentElement) {
      const style = getComputedStyle(ancestor);
      if (ancestor.hidden || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') visible = false;
    }
    return {
      tag: element.tagName.toLowerCase(), id: element.id, name: element.getAttribute('name'), type: element.getAttribute('type'),
      visible, disabled: element.matches(':disabled'), busy: Boolean(element.closest('[aria-busy="true"]')),
      labelSignature: textSignature(element.labels?.[0]?.textContent || element.textContent || ''),
      checked: Boolean(element.checked) || element.getAttribute('aria-checked') === 'true',
      selectedIndex: element.tagName === 'SELECT' ? element.selectedIndex : undefined,
      invalid: element.matches(':invalid, [aria-invalid="true"]'), filled: Boolean(element.value),
    };
  };
  return {
    readyState: document.readyState,
    questionSignature: textSignature(Array.from(document.querySelectorAll('h1,h2,h3,legend,.question-title,.question-text,.twy-cqlabel')).map(element => element.textContent).join(' ')),
    visualOnly: Array.from(document.querySelectorAll('canvas,video')).some(element => describeControl(element).visible),
    forms: Array.from(document.forms).slice(0, 20).map(form => ({
      id: form.id, controls: Array.from(form.elements).slice(0, 60).map(describeControl),
    })),
    controls: Array.from(document.querySelectorAll('input:not([type="hidden"]),select,textarea')).filter(element => !element.form).slice(0, 120).map(describeControl),
    buttons: Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).slice(0, 30).map(describeControl),
  };
}
