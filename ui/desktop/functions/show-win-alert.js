/**
 * Show win alert.
 * @param {string} message message.
 * @param {string} title title.
 * @return {void} Kết quả xử lý show win alert.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function showWinAlert(message, title = 'AutoLeadPC') {
      const overlay = document.getElementById('winMsgBoxOverlay');
      if (overlay) {
        document.getElementById('winMsgBoxTitle').textContent = title;
        document.getElementById('winMsgBoxContent').textContent = message;
        document.getElementById('winMsgBoxBtnRow').innerHTML = '<button type="button" class="win-btn win-btn-primary" style="padding:3px 24px;" onclick="closeWinAlert()">OK</button>';
        overlay.style.display = 'flex';
      } else {
        alert(message);
      }
    }
