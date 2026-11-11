/**
 * Close win alert.
 * @return {void} Kết quả xử lý close win alert.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function closeWinAlert() {
      const overlay = document.getElementById('winMsgBoxOverlay');
      if (overlay) overlay.style.display = 'none';
    }
