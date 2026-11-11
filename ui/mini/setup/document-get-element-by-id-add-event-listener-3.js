document.getElementById('btnSendText')?.addEventListener('click', async () => {
      const input = document.getElementById('textInput');
      const text = input?.value;
      if (!text) return;
      await sendInput({ type: 'insertText', text });
      input.value = '';
      showToast(`Đã gõ: "${text}"`);
      try { tg?.HapticFeedback?.notificationOccurred('success'); } catch (e) {}
    });
