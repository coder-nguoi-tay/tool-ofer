/**
 * Mở thêm tab và cập nhật thanh tab nếu người dùng vẫn đang xem cùng phiên.
 * @param {number} slot Slot cần mở thêm tab.
 * @return {Promise<void>} Cập nhật thanh tab khi trình duyệt xác nhận đã mở.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function _openNewTab(slot) {
      const stream = _screenEventSource;
      try {
        const res = await fetch(`/screen/tabs/new/${slot}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json().catch(() => ({}));
        if (slot !== _screenActiveSlot || stream !== _screenEventSource) return;
        if (!res.ok || !data.ok) {
          showToast(data.error || 'Chưa mở được tab.', 'error');
          return;
        }
        await _fetchAndRenderTabs(slot);
      } catch { }
    }
