/**
 * Fmt time.
 * @param {*} iso iso.
 * @return {*} Kết quả xử lý fmt time.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function fmtTime(iso) {
      const d = new Date(iso);
      return d.toLocaleTimeString('vi-VN', { hour12: false });
    }
