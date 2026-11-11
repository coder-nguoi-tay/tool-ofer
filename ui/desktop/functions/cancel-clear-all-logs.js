/**
 * Cancel clear all logs.
 * @return {void} Kết quả xử lý cancel clear all logs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function cancelClearAllLogs() {
      const bar = document.getElementById('logClearConfirmBar');
      if (bar) bar.style.display = 'none';
    }
