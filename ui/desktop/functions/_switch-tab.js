/**
 * Chỉ đổi tab được chọn sau khi server xác nhận đã chuyển nguồn Screen View.
 * @param {number} slot slot.
 * @param {number} index index.
 * @param {string} [manualCaptchaRequestId] Mã lượt chờ để xác nhận tab chưa đổi vị trí.
 * @return {Promise<void>} Kết quả xử lý  switch tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function _switchTab(slot, index, manualCaptchaRequestId) {
      const requestId = Symbol();
      _switchTab.latest = requestId;
      try {
        const response = await fetch(`/screen/tabs/${slot}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index, manualCaptchaRequestId }),
        });
        const result = await response.json();
        if (_switchTab.latest !== requestId || result.superseded) return;
        if (!response.ok || !result.ok) throw new Error(result.error || 'Chưa chuyển được tab đang xem.');
      } catch (error) {
        if (_switchTab.latest !== requestId) return;
        showToast(error.message || 'Chưa chuyển được tab đang xem.', 'error');
        return;
      }
      _screenActiveTabIndex = index;
      const htmlPanel = document.getElementById('screenHtmlPanel');
      if (htmlPanel) { htmlPanel.style.display = 'none'; htmlPanel.dataset.request = String(Number(htmlPanel.dataset.request || 0) + 1); }
      await _fetchAndRenderTabs(slot);
    }
