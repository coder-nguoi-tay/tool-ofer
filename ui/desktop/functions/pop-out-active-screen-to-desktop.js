/**
 * Pop out active screen to desktop.
 * @return {Promise<void>} Kết quả xử lý pop out active screen to desktop.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function popOutActiveScreenToDesktop() {
      if (!_screenActiveSlot) return;
      await toggleBrowserWindow(_screenActiveSlot, false);
      const btn = document.getElementById('btnModalPopOutDesktop');
      if (btn) {
        btn.textContent = '✓ Đã mở ngoài Desktop';
        btn.style.background = '#16a34a';
        setTimeout(() => {
          if (btn) {
            btn.textContent = '🖥️ Mở ra Desktop';
            btn.style.background = '#0284c7';
          }
        }, 2500);
      }
    }
