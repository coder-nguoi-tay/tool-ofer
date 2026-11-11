/**
 * Toggle lead cookie config.
 * @return {void} Kết quả xử lý toggle lead cookie config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function toggleLeadCookieConfig() {
      const drawer = document.getElementById('leadCookieConfigDrawer');
      if (drawer) {
        drawer.style.display = drawer.style.display === 'none' ? 'block' : 'none';
      }
    }
