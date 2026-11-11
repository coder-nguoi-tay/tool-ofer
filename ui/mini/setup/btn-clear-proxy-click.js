document.getElementById('btnClearProxy').addEventListener('click', async () => {
      if (confirm('Xóa sạch hàng đợi proxy?')) {
        await fetch('/proxy-queue/clear', { method: 'POST' });
        showToast('Đã xóa sạch hàng đợi proxy');
        pollResources();
      }
    });
