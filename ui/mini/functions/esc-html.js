/**
 * Esc html.
 * @param {*} str str.
 * @return {*} Kết quả xử lý esc html.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function escHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
