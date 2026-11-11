/**
 *  close tab.
 * @param {number} slot slot.
 * @param {number} index index.
 * @return {Promise<void>} Kết quả xử lý  close tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function _closeTab(slot, index) {
      try {
        const res = await fetch(`/screen/tabs/close/${slot}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ index }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.closedSession) {
          closeScreenModal();
          fetchRunningState();
          return;
        }
        if (data.activeIndex !== undefined) {
          _screenActiveTabIndex = data.activeIndex;
        } else if (_screenActiveTabIndex >= index && _screenActiveTabIndex > 0) {
          _screenActiveTabIndex--;
        }
        await _fetchAndRenderTabs(slot);
      } catch { }
    }
