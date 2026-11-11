/**
 * Chụp trạng thái form để phân biệt chưa điền, bị khóa, lỗi validation và đã ẩn.
 * Hàm tự chứa để chạy trong frame; không thu giá trị người dùng nhập.
 * @return {object} Trạng thái tải, form, trường và nút tại thời điểm chụp.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
export function inspectFormState() {
  /**
   * Mô tả mức sẵn sàng của trường/nút, không đọc nội dung dữ liệu để lưu log.
   * @param {Element} element Trường hoặc nút cần kiểm tra.
   * @return {object} Định danh và trạng thái hiển thị/validation.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-10
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
      invalid: element.matches(':invalid, [aria-invalid="true"]'), filled: Boolean(element.value),
    };
  };
  return {
    readyState: document.readyState,
    forms: Array.from(document.forms).slice(0, 20).map(form => ({
      id: form.id, controls: Array.from(form.elements).slice(0, 60).map(describeControl),
    })),
    buttons: Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).slice(0, 30).map(describeControl),
  };
}
