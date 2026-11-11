/**
 *  reload screen.
 * @return {Promise<void>} Kết quả xử lý  reload screen.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function _reloadScreen() {
      if (!_screenActiveSlot) return;
      await fetch(`/screen/reload/${_screenActiveSlot}`, { method: 'POST' }).catch(() => { });
      _fetchAndRenderTabs(_screenActiveSlot);
    }
