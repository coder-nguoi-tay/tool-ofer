/**
 * Thêm proxy từ ô nhập vào hàng đợi (giữ hàng đợi cũ), gửi kèm giao thức như desktop.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResImportProxy() {
  const proxyList = document.getElementById('taProxyInput').value.trim();
  if (!proxyList) { alert('Vui lòng dán danh sách proxy!'); return; }
  const btn = document.getElementById('resBtnImportProxy');
  if (btn.disabled) return;
  btn.disabled = true;
  try {
    const res = await miniResApi('/proxy-queue/import', {
      proxyList,
      proxyType: document.getElementById('resProxyType').value,
      mode: 'append',
    });
    if (res.error || res.added === undefined) {
      alert(res.error || 'Không thêm được proxy vào hàng đợi. Vui lòng thử lại.');
      return;
    }
    showToast(res.message);
    miniResUpdateProxyHealth(res.available, res.used);
    pollResources();
  } finally {
    btn.disabled = false;
  }
}

/**
 * Đặt lại hàng proxy: đưa proxy đã dùng về sẵn sàng và xoá lịch sử trùng IP (như desktop).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResResetProxyQueue() {
  if (!confirm('Đặt lại hàng proxy? Proxy đã dùng sẽ quay về sẵn sàng và lịch sử trùng IP bị xoá.')) return;
  const res = await miniResApi('/proxy-queue/reset', {
    proxyList: document.getElementById('taProxyInput').value,
    clearAllUsedIps: true,
  });
  if (res.error) { alert('Lỗi: ' + res.error); return; }
  showToast(res.message || 'Đã đặt lại hàng proxy.');
  miniResUpdateProxyHealth(res.available, res.used);
  pollResources();
}

/**
 * Vẽ thanh sức khoẻ hàng proxy (phần sẵn sàng / đã dùng).
 * @param {number} ready Số proxy sẵn sàng.
 * @param {number} used Số proxy đã dùng.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniResUpdateProxyHealth(ready, used) {
  const r = Number(ready) || 0;
  const total = r + (Number(used) || 0);
  const readyPct = total > 0 ? Math.round((r / total) * 100) : 0;
  document.getElementById('resProxyHealthReady').style.width = `${readyPct}%`;
  document.getElementById('resProxyHealthUsed').style.width = `${total > 0 ? 100 - readyPct : 0}%`;
  document.getElementById('resProxyHealthRatio').textContent = total > 0
    ? `${readyPct}% sẵn sàng (${r}/${total})`
    : '0% sẵn sàng';
}

/**
 * Lấy số liệu hàng proxy rồi cập nhật thanh sức khoẻ.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniResRefreshProxyHealth() {
  const pq = await miniResApi('/proxy-queue');
  if (!pq.error) miniResUpdateProxyHealth(pq.available, pq.used);
}
