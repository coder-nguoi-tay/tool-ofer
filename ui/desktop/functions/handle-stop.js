/**
 * Handle stop.
 * @return {Promise<void>} Kết quả xử lý handle stop.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleStop() {
      const btnStart = document.getElementById('btnStart');
      if (btnStart) {
        btnStart.disabled = true;
        btnStart.textContent = '🛑 Đang dừng...';
      }
      document.getElementById('lbStatus').textContent = 'Đang dừng tất cả tiến trình...';
      const result = await api('/stop', { method: 'POST' });
      if (result?.error) showWinAlert(`Không dừng được trình duyệt: ${result.error}`);
      document.getElementById('lbStatus').textContent = 'Đã dừng toàn bộ luồng & đóng trình duyệt.';
      fetchRunningState();
    }
