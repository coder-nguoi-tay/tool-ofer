document.getElementById('btnResetEmail').addEventListener('click', async () => {
      await fetch('/email-queue/reset', { method: 'POST' });
      showToast('Đã đặt lại email mẫu');
      pollResources();
    });
