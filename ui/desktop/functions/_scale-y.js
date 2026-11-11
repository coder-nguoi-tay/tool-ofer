/**
 *  scale y.
 * @param {*} e e.
 * @param {*} canvas canvas.
 * @return {*} Kết quả xử lý  scale y.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _scaleY(e, canvas) {
      const rect = canvas.getBoundingClientRect();
      return Math.round((e.clientY - rect.top) * (canvas.height / rect.height));
    }
