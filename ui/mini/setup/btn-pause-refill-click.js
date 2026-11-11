document.getElementById('btnPauseRefill').addEventListener('click', async () => {
      await fetch('/auto-refill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) });
      showToast('Đã tạm dừng mở slot mới');
      pollState();
    });
