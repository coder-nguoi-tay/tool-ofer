/**
 * Stop log refresh.
 * @return {void} Kết quả xử lý stop log refresh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function stopLogRefresh() {
      if (logRefreshTimer) { clearInterval(logRefreshTimer); logRefreshTimer = null; }
    }
