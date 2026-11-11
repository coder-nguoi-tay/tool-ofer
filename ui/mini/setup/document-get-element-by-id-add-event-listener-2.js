document.getElementById('btnSelectAll')?.addEventListener('click', async () => {
      await sendInput({ type: 'shortcut', command: 'selectAll' });
      showToast('Đã chọn tất cả (Ctrl+A)');
    });
