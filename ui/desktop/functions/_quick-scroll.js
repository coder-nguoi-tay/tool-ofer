/**
 *  quick scroll.
 * @param {*} deltaX delta x.
 * @param {*} deltaY delta y.
 * @return {void} Kết quả xử lý  quick scroll.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _quickScroll(deltaX, deltaY) {
      if (!_screenActiveSlot) return;
      const canvas = document.getElementById('screenCanvas');
      const x = Math.round((canvas?.width || 960) / 2);
      const y = Math.round((canvas?.height || 720) / 2);
      _sendInput(_screenActiveSlot, {
        type: 'wheel',
        x,
        y,
        deltaX,
        deltaY,
        clientWidth: canvas?.width || 960,
        clientHeight: canvas?.height || 720,
      });
    }
