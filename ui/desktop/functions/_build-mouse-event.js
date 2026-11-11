/**
 *  build mouse event.
 * @param {*} type type.
 * @param {*} e e.
 * @param {*} canvas canvas.
 * @return {*} Kết quả xử lý  build mouse event.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _buildMouseEvent(type, e, canvas) {
      return {
        type,
        x: _scaleX(e, canvas),
        y: _scaleY(e, canvas),
        clientWidth: canvas.width,
        clientHeight: canvas.height,
        button: ({ 0: 'left', 1: 'middle', 2: 'right' })[e.button] || 'none',
        modifiers: _mods(e)
      };
    }
