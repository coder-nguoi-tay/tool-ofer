/**
 * Đóng danh sách chọn trong Screen View và ngừng theo dõi chuột, phím của danh sách này.
 * @return {void} Gỡ bộ chọn đang mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function _closeSelectPicker() {
      const picker = document.getElementById('screenSelectPicker');
      if (picker) {
        picker.dismissListeners.abort();
        picker.remove();
      }
    }
