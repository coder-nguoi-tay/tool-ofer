/**
 * Copy log html content.
 * @return {void} Kết quả xử lý copy log html content.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function copyLogHtmlContent() {
      const text = document.getElementById('logModalPre').textContent;
      navigator.clipboard.writeText(text);
      document.getElementById('lbStatus').textContent = 'Đã sao chép toàn bộ HTML vào clipboard.';
    }
