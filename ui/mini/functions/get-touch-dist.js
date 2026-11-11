/**
 * Get touch dist.
 * @param {*} t1 t1.
 * @param {*} t2 t2.
 * @return {*} Kết quả xử lý get touch dist.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getTouchDist(t1, t2) {
      const dx = t1.clientX - t2.clientX;
      const dy = t1.clientY - t2.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }
