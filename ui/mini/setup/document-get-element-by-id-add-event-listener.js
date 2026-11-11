document.getElementById('btnPasteText')?.addEventListener('click', async () => {
      await sendInput({ type: 'shortcut', command: 'paste' });
      showToast('Đã gửi phím dán (Paste)');
    });
