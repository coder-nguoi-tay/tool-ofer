/**
 * Copy log html file path.
 * @return {void} Kết quả xử lý copy log html file path.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function copyLogHtmlFilePath() {
      if (window.__currentLogModalFilePath) {
        navigator.clipboard.writeText(window.__currentLogModalFilePath);
        document.getElementById('lbStatus').textContent = 'Đã sao chép đường dẫn file HTML vào clipboard.';
      }
    }
