/**
 * Handle show all browsers.
 * @return {Promise<void>} Kết quả xử lý handle show all browsers.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleShowAllBrowsers() {
      document.getElementById('lbStatus').textContent = 'Đang bung tất cả cửa sổ trình duyệt ra Desktop...';
      try {
        const res = await api('/browser/show-all', { method: 'POST' });
        document.getElementById('lbStatus').textContent = `✓ Đã hiển thị ${res.count || 0} cửa sổ trình duyệt ra Desktop.`;
        fetchRunningState();
      } catch (err) {
        document.getElementById('lbStatus').textContent = `Lỗi: ${err.message}`;
      }
    }
