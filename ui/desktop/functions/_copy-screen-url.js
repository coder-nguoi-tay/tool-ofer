/**
 *  copy screen url.
 * @return {void} Kết quả xử lý  copy screen url.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _copyScreenUrl() {
      const input = document.getElementById('screenUrlInput');
      if (!input || !input.value) return;
      copyToClipboard(input.value, 'Đã sao chép URL vào bộ nhớ tạm');
    }
