/**
 * Start lead countdown.
 * @return {void} Kết quả xử lý start lead countdown.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function startLeadCountdown() {
      if (leadCountdownInterval) clearInterval(leadCountdownInterval);
      leadCountdownInterval = setInterval(() => {
        leadRefreshCountdownSec--;
        if (leadRefreshCountdownSec <= 0) {
          leadRefreshCountdownSec = 10;
        }
        updateCountdownDisplay();
      }, 1000);
    }
