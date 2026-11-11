/**
 * Copy log html dir.
 * @return {void} Kết quả xử lý copy log html dir.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function copyLogHtmlDir() {
      if (logStorageDir) {
        navigator.clipboard.writeText(logStorageDir);
        document.getElementById('lbStatus').textContent = 'Đã sao chép đường dẫn thư mục HTML vào clipboard.';
      }
    }
