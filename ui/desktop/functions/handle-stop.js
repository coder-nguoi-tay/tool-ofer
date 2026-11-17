/**
 * Dừng toàn bộ và phản ánh lỗi/cảnh báo dừng, không báo thành công khi native còn sống.
 * @return {Promise<void>} Kết quả xử lý handle stop.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-17
 */
async function handleStop() {
      if (typeof cancelOfferSchedule === 'function') {
        cancelOfferSchedule();
      }
      if (typeof cancelStopScheduler === 'function') {
        cancelStopScheduler();
      }
      const btnStart = document.getElementById('btnStart');
      if (btnStart) {
        btnStart.disabled = true;
        btnStart.textContent = '🛑 Đang dừng...';
      }
      document.getElementById('lbStatus').textContent = 'Đang dừng tất cả tiến trình...';
      try {
        const result = await api('/stop', { method: 'POST' });
        const failure = result?.error || result?.warnings?.join('\n');
        document.getElementById('lbStatus').textContent = failure
          ? `Chưa dừng hoàn tất: ${failure}`
          : result?.results?.join(' ') || 'Đã dừng toàn bộ luồng & đóng trình duyệt.';
        if (failure) showWinAlert(`Chưa dừng hoàn tất: ${failure}`);
      } catch (error) {
        document.getElementById('lbStatus').textContent = `Lỗi dừng trình duyệt: ${error.message}`;
      } finally {
        await fetchRunningState();
      }
    }
