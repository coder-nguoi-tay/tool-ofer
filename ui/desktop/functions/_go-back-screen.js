/**
 *  go back screen.
 * @return {Promise<void>} Kết quả xử lý  go back screen.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function _goBackScreen() {
      if (!_screenActiveSlot) return;
      const fpsEl = document.getElementById('screenModalFps');
      const res = await fetch(`/screen/back/${_screenActiveSlot}`, { method: 'POST' }).then((r) => r.json()).catch(() => null);
      if (fpsEl && res && res.ok === false) fpsEl.textContent = '⚠️ Không còn trang trước để quay lại';
      _fetchAndRenderTabs(_screenActiveSlot);
    }
