/**
 * Gỡ công cụ chọn option và cột hồ sơ khi đích thao tác trong Screen View thay đổi.
 * @param {void} Không có tham số.
 * @return {void} Gỡ bộ chọn đang mở.
 * @throws {Error} Khi không thể gỡ listener hoặc phần tử danh sách khỏi DOM.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function _closeSelectPicker() {
      document.getElementById('screenRecordPicker')?.remove();
      const picker = document.getElementById('screenSelectPicker');
      if (picker) {
        picker.dismissListeners.abort();
        picker.remove();
      }
    }
