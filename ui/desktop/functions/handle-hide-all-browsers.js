/**
 * Handle hide all browsers.
 * @return {Promise<void>} Kết quả xử lý handle hide all browsers.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleHideAllBrowsers() {
      document.getElementById('lbStatus').textContent = 'Đang thu nhỏ tất cả trình duyệt về chạy ngầm trong app...';
      try {
        const res = await api('/browser/hide-all', { method: 'POST' });
        document.getElementById('lbStatus').textContent = `✓ Đã thu nhỏ ${res.count || 0} trình duyệt về chạy ngầm trong app.`;
        fetchRunningState();
      } catch (err) {
        document.getElementById('lbStatus').textContent = `Lỗi: ${err.message}`;
      }
    }
