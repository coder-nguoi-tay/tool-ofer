/**
 * Chuyển tab đang điều khiển và hủy bảng HTML của tab trước.
 * @param {number} slot slot.
 * @param {number} index index.
 * @return {Promise<void>} Kết quả xử lý  switch tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
async function _switchTab(slot, index) {
      _screenActiveTabIndex = index;
      const htmlPanel = document.getElementById('screenHtmlPanel');
      if (htmlPanel) { htmlPanel.style.display = 'none'; htmlPanel.dataset.request = String(Number(htmlPanel.dataset.request || 0) + 1); }
      await fetch(`/screen/tabs/${slot}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      }).catch(() => { });
      _fetchAndRenderTabs(slot);
    }
