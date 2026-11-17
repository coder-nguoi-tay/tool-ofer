document.getElementById('btnStopAll').addEventListener('click', async () => {
      const btnStart = document.getElementById('btnStartLaunch');
      if (btnStart) {
        btnStart.disabled = true;
        btnStart.textContent = '🛑 ĐANG DỪNG CÁC LUỒNG...';
      }
      showToast('🛑 Đang dừng toàn bộ luồng...');
      try {
        const response = await fetch('/stop', { method: 'POST' });
        const result = await response.json();
        if (!response.ok || result.error) throw new Error(result.error || `HTTP ${response.status}`);
        showToast(result.warnings?.length ? `⚠️ ${result.warnings.join(' ')}` : result.results?.join(' ') || '✓ Đã dừng tất cả luồng');
      } catch (err) {
        showToast('Lỗi dừng luồng: ' + err.message);
      } finally {
        await pollState();
      }
    });
