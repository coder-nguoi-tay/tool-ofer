/**
 * Open bandwidth modal.
 * @param {number} highlightSlot highlight slot.
 * @param {*} subTab sub tab.
 * @return {void} Kết quả xử lý open bandwidth modal.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function openBandwidthModal(highlightSlot = null, subTab = null) {
      _bandwidthModalHighlightSlot = highlightSlot;
      const modal = document.getElementById('bandwidthModal');
      if (modal) modal.style.display = 'flex';
      const targetTab = subTab || (highlightSlot ? 'slots' : (_activeBandwidthSubTab || 'slots'));
      switchBandwidthSubTab(targetTab);
      fetchBandwidthStats();
      proxy711FetchBalance(false);
      if (!_bandwidthAutoRefreshTimer) {
        _bandwidthAutoRefreshTimer = setInterval(fetchBandwidthStats, 2000);
      }
    }
