document.getElementById('btnResetLeadCount').addEventListener('click', async () => {
      await fetch('/limit-run/reset', { method: 'POST' });
      showToast('Đã reset bộ đếm Leads');
      pollState();
    });
