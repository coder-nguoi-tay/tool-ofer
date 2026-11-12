/**
 * Phân biệt thao tác chưa hoàn tất với màn chờ chỉ còn control đã chọn hoặc bị khóa.
 * @param {object} state Trạng thái control hiển thị của các frame.
 * @return {boolean} True nếu có trường cần điền, lựa chọn chưa trả lời hoặc nút sẵn sàng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
export function hasActionableWork(state) {
  return state.frames.some(frame => frame.controls.some(control => {
    if (control.disabled || control.readOnly) return false;
    if (['checkbox', 'radio'].includes(control.type)) {
      if (control.checked) return false;
      const selectedCount = frame.controls.filter(other => other.group === control.group && other.type === control.type && other.checked).length;
      return control.required || selectedCount < (control.type === 'checkbox' ? control.minimumChoices || 1 : 1);
    }
    if (control.tag === 'select' && control.pendingSelection) return true;
    if (control.selected) return false;
    if (['submit', 'button', 'image'].includes(control.type) || ['button', 'a'].includes(control.tag)) return !/^(back|previous|cancel|close|privacy|terms)$/i.test(control.label);
    return control.invalid || !String(control.value).trim();
  }));
}
