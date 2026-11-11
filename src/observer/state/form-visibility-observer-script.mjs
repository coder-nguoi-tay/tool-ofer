/** Script chạy trong closure observer, dùng emit/describe đã có để theo dõi form ẩn/hiện. */
export const FORM_VISIBILITY_OBSERVER_SCRIPT = `
  const formVisibility = new Map();
  /**
   * Báo thay đổi hiển thị form mà không sửa DOM hoặc thu dữ liệu đã nhập.
   * @return {void} Phát sự kiện khi form được tạo, ẩn, hiện hoặc xóa.
   * @author ductv <ductv@getflycrm.com>
   * @since 2026-11-10
   */
  const reportFormVisibility = () => {
    for (const form of Array.from(document.forms).slice(0, 20)) {
      let visible = Boolean(form.getBoundingClientRect().width && form.getBoundingClientRect().height);
      for (let parent = form; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent);
        if (parent.hidden || style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') visible = false;
      }
      if (!formVisibility.has(form) || formVisibility.get(form) !== visible) {
        emit({ kind: 'form_state', visible, created: !formVisibility.has(form), el: describe(form) });
        formVisibility.set(form, visible);
      }
    }
    for (const form of formVisibility.keys()) {
      if (form.isConnected) continue;
      emit({ kind: 'form_state', visible: false, removed: true, el: describe(form) });
      formVisibility.delete(form);
    }
  };
  new MutationObserver(reportFormVisibility).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
  reportFormVisibility();
`;
