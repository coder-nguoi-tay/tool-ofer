/**
 * Dừng luồng Screen View và gỡ các điều khiển thuộc phiên đang xem.
 * @return {void} Giải phóng kết nối, bộ hẹn giờ và bộ chọn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function _stopScreenStream() {
      _closeSelectPicker();
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
