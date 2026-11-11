/**
 * Thêm danh sách proxy dán tay vào hàng đợi và cập nhật số lượng sau khi lưu thành công.
 * @return {Promise<void>} Hoàn tất nhập hoặc hiển thị lỗi, giữ nội dung khi chưa nhập được.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
async function importManualProxyQueue() {
  const button = document.getElementById('btnImportProxyQueue');
  if (button.disabled) return;
  const proxyList = document.getElementById('txtDashboardProxy').value.trim();
  if (!proxyList) {
    showWinAlert('Vui lòng dán danh sách proxy trước khi thêm vào hàng đợi.');
    return;
  }
  button.disabled = true;
  try {
    const result = await api('/proxy-queue/import', {
      method: 'POST',
      body: JSON.stringify({ proxyList, proxyType: document.getElementById('dashboardProxyType').value, mode: 'append' }),
    });
    if (!result || result.error || result.added === undefined) {
      showWinAlert(result?.error || 'Không thêm được proxy vào hàng đợi. Vui lòng thử lại.');
      return;
    }
    document.getElementById('lbStatus').textContent = result.message;
    if (result.added > 0) await loadProxyQueue();
    showWinAlert(result.message);
  } finally {
    button.disabled = false;
  }
}
