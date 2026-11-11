document.getElementById('btnStopAll').addEventListener('click', async () => {
      const btnStart = document.getElementById('btnStartLaunch');
      if (btnStart) {
        btnStart.disabled = true;
        btnStart.textContent = '🛑 ĐANG DỪNG CÁC LUỒNG...';
      }
      showToast('🛑 Đang dừng toàn bộ luồng...');
      try {
        await fetch('/stop', { method: 'POST' });
        showToast('✓ Đã dừng tất cả luồng');
      } catch (err) {
        showToast('Lỗi dừng luồng: ' + err.message);
      } finally {
        await pollState();
      }
    });
