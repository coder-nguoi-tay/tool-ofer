/**
 *  scale x.
 * @param {*} e e.
 * @param {*} canvas canvas.
 * @return {*} Kết quả xử lý  scale x.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _scaleX(e, canvas) {
      const rect = canvas.getBoundingClientRect();
      return Math.round((e.clientX - rect.left) * (canvas.width / rect.width));
    }
