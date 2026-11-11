/**
 * Clear proxy queue.
 * @return {Promise<void>} Kết quả xử lý clear proxy queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function clearProxyQueue() {
      if (!confirm('Bạn có chắc chắn muốn xóa hết tất cả proxy trong hàng đợi không?')) return;
      try {
        const res = await api('/proxy-queue/clear', { method: 'POST' });
        document.getElementById('txtDashboardProxy').value = '';
        document.getElementById('lbProxyCount').textContent = '0';
        document.getElementById('lbProxyUsed').textContent = '0';
        document.getElementById('lbStatus').textContent = res?.message || 'Đã xóa tất cả proxy.';
        await loadProxyQueue();
        showWinAlert(res?.message || 'Đã xóa hết tất cả proxy trong hàng đợi thành công.');
      } catch (err) {
        showWinAlert('Lỗi xóa proxy: ' + (err.message || err));
      }
    }
