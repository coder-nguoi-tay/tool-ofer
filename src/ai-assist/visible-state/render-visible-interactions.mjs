/**
 * Tạo ngữ cảnh AI từ control đã xác minh hiển thị, giữ selector chính xác và trạng thái khóa/chọn.
 * @param {object[]} frames Trạng thái tương tác của từng frame.
 * @return {string} Dữ liệu HTML tối giản, không bao gồm các bước ẩn của trang gốc.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
export function renderVisibleInteractions(frames) {
  /**
   * Bảo toàn nhãn và selector khi đưa vào ngữ cảnh HTML của AI.
   * @param {*} text Nội dung lấy từ control hiển thị.
   * @return {string} Nội dung đã escape ký tự HTML.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-11
   */
  const escape = text => String(text ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  return frames.map(frame => `<section data-frame="${escape(frame.url)}">\n${frame.questions.map(question => `<h3>${escape(question)}</h3>`).join('\n')}\n${frame.controls.map(control => `<control selector="${escape(control.selector)}" type="${escape(control.type)}" id="${escape(control.id)}" name="${escape(control.name)}" disabled="${control.disabled}" checked="${control.checked}" selected="${control.selected}" readonly="${control.readOnly}" required="${control.required}" invalid="${control.invalid}">${escape(control.label)}\n${escape(JSON.stringify({ value: control.value, options: control.options }))}</control>`).join('\n')}\n${frame.errors.map(error => `<error>${escape(error)}</error>`).join('\n')}\n</section>`).join('\n');
}
