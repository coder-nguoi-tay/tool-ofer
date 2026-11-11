/**
 * Toggle browser window.
 * @param {number} slot slot.
 * @param {*} isCurrentlyVisible is currently visible.
 * @return {Promise<void>} Kết quả xử lý toggle browser window.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function toggleBrowserWindow(slot, isCurrentlyVisible) {
      const endpoint = isCurrentlyVisible ? `/browser/hide/${slot}` : `/browser/show/${slot}`;
      const actionName = isCurrentlyVisible ? 'Thu nhỏ cửa sổ' : 'Hiện cửa sổ Desktop';
      document.getElementById('lbStatus').textContent = `Đang ${actionName} Slot ${slot}...`;
      try {
        const res = await api(endpoint, { method: 'POST' });
        if (res.error) {
          showWinAlert(`Lỗi ${actionName}: ${res.error}`);
        } else {
          document.getElementById('lbStatus').textContent = `✓ Đã ${actionName} Slot ${slot} thành công.`;
          fetchRunningState();
        }
      } catch (err) {
        document.getElementById('lbStatus').textContent = `Lỗi: ${err.message}`;
      }
    }
