document.getElementById('textInput')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('btnSendText')?.click();
      }
    });
