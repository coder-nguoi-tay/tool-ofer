/**
 *  open new tab.
 * @param {number} slot slot.
 * @return {Promise<void>} Kết quả xử lý  open new tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function _openNewTab(slot) {
      try {
        const res = await fetch(`/screen/tabs/new/${slot}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json().catch(() => ({}));
        if (data.index !== undefined) {
          _screenActiveTabIndex = data.index;
        }
        await _fetchAndRenderTabs(slot);
      } catch { }
    }
