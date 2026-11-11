/**
 *  navigate to url.
 * @return {Promise<void>} Kết quả xử lý  navigate to url.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function _navigateToUrl() {
      if (!_screenActiveSlot) return;
      const input = document.getElementById('screenUrlInput');
      const url = input ? input.value.trim() : '';
      if (!url) return;
      await fetch(`/screen/navigate/${_screenActiveSlot}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      }).catch(() => { });
      _fetchAndRenderTabs(_screenActiveSlot);
    }
