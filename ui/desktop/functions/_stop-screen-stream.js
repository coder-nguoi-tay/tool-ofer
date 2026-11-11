/**
 *  stop screen stream.
 * @return {void} Kết quả xử lý  stop screen stream.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _stopScreenStream() {
      if (_screenReconnectTimer) { clearTimeout(_screenReconnectTimer); _screenReconnectTimer = null; }
      if (_screenEventSource) { _screenEventSource.close(); _screenEventSource = null; }
      if (_screenFpsTimer) { clearInterval(_screenFpsTimer); _screenFpsTimer = null; }
      if (_screenTabPollTimer) { clearInterval(_screenTabPollTimer); _screenTabPollTimer = null; }
      if (_mouseMoveTimer) { clearTimeout(_mouseMoveTimer); _mouseMoveTimer = null; }
      if (_wheelTimer) { clearTimeout(_wheelTimer); _wheelTimer = null; }
      const canvas = document.getElementById('screenCanvas');
      if (canvas) {
        canvas.onmousedown = canvas.onmouseup = canvas.onmousemove = canvas.onwheel = canvas.onkeydown = canvas.onkeyup = canvas.onpaste = null;
      }
      document.getElementById('screenTabBar').innerHTML = '';
      document.getElementById('screenTabBar')._uxRenderKey = null;
    }
