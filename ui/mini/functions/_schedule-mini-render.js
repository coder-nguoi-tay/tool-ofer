/**
 *  schedule mini render.
 * @param {*} fn fn.
 * @return {void} Kết quả xử lý  schedule mini render.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _scheduleMiniRender(fn) {
      let executed = false;
      const runner = () => {
        if (executed) return;
        executed = true;
        if (_miniRenderTimeout) {
          clearTimeout(_miniRenderTimeout);
          _miniRenderTimeout = null;
        }
        fn();
      };

      if (typeof document !== 'undefined' && document.hidden) {
        _miniRenderTimeout = setTimeout(runner, 0);
        return;
      }

      requestAnimationFrame(runner);
      _miniRenderTimeout = setTimeout(runner, 20);
    }
