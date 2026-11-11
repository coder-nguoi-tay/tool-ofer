document.querySelector('#log-clear-confirm-yes').addEventListener('click', async () => {
      document.querySelector('#log-clear-confirm').style.display = 'none';
      const res = await fetch('/browser-logs/clear', { method: 'POST' }).then((r) => r.json());
      status.textContent = res.message || 'Đã xoá toàn bộ log và các file HTML.';
      await fetchLogs();
    });
