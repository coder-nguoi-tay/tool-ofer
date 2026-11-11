/**
 * Update countdown display.
 * @return {void} Kết quả xử lý update countdown display.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function updateCountdownDisplay() {
      const el = document.getElementById('leadRefreshCountdown');
      if (el) {
        el.textContent = `(${leadRefreshCountdownSec}s)`;
        el.style.color = leadRefreshCountdownSec <= 2 ? '#16a34a' : '#0284c7';
      }
    }
