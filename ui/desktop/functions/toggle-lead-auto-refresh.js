/**
 * Toggle lead auto refresh.
 * @param {*} enabled enabled.
 * @return {void} Kết quả xử lý toggle lead auto refresh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function toggleLeadAutoRefresh(enabled) {
      if (leadAutoRefreshTimer) {
        clearInterval(leadAutoRefreshTimer);
        leadAutoRefreshTimer = null;
      }
      if (leadCountdownInterval) {
        clearInterval(leadCountdownInterval);
        leadCountdownInterval = null;
      }
      const elCd = document.getElementById('leadRefreshCountdown');

      if (enabled) {
        resetLeadCountdown();
        startLeadCountdown();
        leadAutoRefreshTimer = setInterval(() => {
          fetchToffersLeads(false);
          resetLeadCountdown();
        }, 10000);
      } else {
        if (elCd) elCd.textContent = '(đã tắt)';
      }
    }
