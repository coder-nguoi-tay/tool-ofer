/**
 * Start log refresh.
 * @return {void} Kết quả xử lý start log refresh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function startLogRefresh() {
      stopLogRefresh();
      fetchLogs();
      logRefreshTimer = setInterval(() => {
        const auto = document.getElementById('chkLogAutoRefresh')?.checked;
        if (auto) fetchLogs();
      }, 2000);
    }
