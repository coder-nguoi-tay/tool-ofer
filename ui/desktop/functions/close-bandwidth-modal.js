/**
 * Close bandwidth modal.
 * @return {void} Kết quả xử lý close bandwidth modal.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function closeBandwidthModal() {
      const modal = document.getElementById('bandwidthModal');
      if (modal) modal.style.display = 'none';
      _bandwidthModalHighlightSlot = null;
      if (_bandwidthAutoRefreshTimer) {
        clearInterval(_bandwidthAutoRefreshTimer);
        _bandwidthAutoRefreshTimer = null;
      }
    }
