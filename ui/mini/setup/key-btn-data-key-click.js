// Quick Action Keys (Enter, Tab, Backspace, Space, Paste, Select All)
    document.querySelectorAll('.key-btn[data-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        sendInput({ type: 'press', key });
        try { tg?.HapticFeedback?.impactOccurred('light'); } catch (e) {}
      });
    });
