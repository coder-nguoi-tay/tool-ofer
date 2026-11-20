/**
 * Đóng tab được chọn và cập nhật đúng cửa sổ Screen View đã gửi yêu cầu.
 * @param {number} slot Slot chứa tab cần đóng.
 * @param {number} [index] Vị trí của nút đóng trên thanh tab.
 * @param {string} [screenSourceId] Nguồn hình tại thời điểm người dùng nhấn phím đóng.
 * @return {Promise<void>} Cập nhật danh sách tab khi trình duyệt xác nhận đã đóng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function _closeTab(slot, index, screenSourceId) {
      const stream = _screenEventSource;
      try {
        const res = await fetch(`/screen/tabs/close/${slot}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index, screenSourceId }),
        });
        const data = await res.json().catch(() => ({}));
        if (slot !== _screenActiveSlot || stream !== _screenEventSource) return;
        if (!res.ok || !data.ok) {
          showToast(data.error || 'Chưa đóng được tab.', 'error');
          return;
        }
        if (data.closedSession) {
          closeScreenModal();
          fetchRunningState();
          return;
        }
        await _fetchAndRenderTabs(slot);
      } catch { }
    }
