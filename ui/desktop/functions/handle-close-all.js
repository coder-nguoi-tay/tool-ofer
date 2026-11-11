/**
 * Handle close all.
 * @return {Promise<void>} Kết quả xử lý handle close all.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleCloseAll() {
      const btnStart = document.getElementById('btnStart');
      if (btnStart) {
        btnStart.disabled = true;
        btnStart.textContent = '🛑 Đang dừng...';
      }
      document.getElementById('lbStatus').textContent = 'Đang đóng tất cả trình duyệt...';
      const result = await api('/stop', { method: 'POST' });
      if (result?.error) showWinAlert(`Không đóng được trình duyệt: ${result.error}`);
      document.getElementById('lbStatus').textContent = 'Đã đóng tất cả trình duyệt.';
      fetchRunningState();
    }
