/**
 * Chỉ đổi tab được chọn sau khi server xác nhận đã chuyển nguồn Screen View.
 * @param {number} slot slot.
 * @param {number} index index.
 * @return {Promise<void>} Kết quả xử lý  switch tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function _switchTab(slot, index) {
      try {
        const response = await fetch(`/screen/tabs/${slot}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index }),
        });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || 'Chưa chuyển được tab đang xem.');
      } catch (error) {
        showToast(error.message || 'Chưa chuyển được tab đang xem.', 'error');
        return;
      }
      _screenActiveTabIndex = index;
      const htmlPanel = document.getElementById('screenHtmlPanel');
      if (htmlPanel) { htmlPanel.style.display = 'none'; htmlPanel.dataset.request = String(Number(htmlPanel.dataset.request || 0) + 1); }
      await _fetchAndRenderTabs(slot);
    }
