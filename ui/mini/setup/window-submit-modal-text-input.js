window.submitModalText = async () => {
      const input = document.getElementById('modalTextInput');
      if (!input || !input.value) return;
      const text = input.value;
      await sendInput({ type: 'insertText', text });
      showToast(`Đã gõ: "${text}"`);
      closeTypeModal();
      try { tg?.HapticFeedback?.notificationOccurred('success'); } catch {}
    };
