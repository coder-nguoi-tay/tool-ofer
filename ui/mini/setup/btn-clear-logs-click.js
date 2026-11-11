document.getElementById('btnClearLogs').addEventListener('click', async () => {
      await fetch('/browser-logs/clear', { method: 'POST' });
      pollLogs();
      showToast('Đã xóa nhật ký');
    });
