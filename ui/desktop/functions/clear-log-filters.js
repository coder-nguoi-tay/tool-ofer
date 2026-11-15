/**
 * Clear log filters.
 * @return {void} Kết quả xử lý clear log filters.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function clearLogFilters() {
      document.getElementById('logFilterSlot').value = '';
      document.getElementById('logFilterType').value = '';
      const ipEl = document.getElementById('logFilterIp');
      if (ipEl) ipEl.value = '';
      currentSelectedOfferLogTab = 'all';
      renderLogs();
    }
