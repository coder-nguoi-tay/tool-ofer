// Typing Modal Handlers
    window.openTypeModal = () => {
      const modal = document.getElementById('typeModal');
      const input = document.getElementById('modalTextInput');
      if (modal) modal.style.display = 'flex';
      if (input) {
        input.value = '';
        input.placeholder = 'Nhập văn bản cần gõ...';
        setTimeout(() => input.focus(), 80);
      }
      try { tg?.HapticFeedback?.selectionChanged(); } catch {}
    };

    window.openTypeModalWithInput = (info) => {
      const modal = document.getElementById('typeModal');
      const input = document.getElementById('modalTextInput');
      if (modal) modal.style.display = 'flex';
      if (input) {
        input.value = info?.value || '';
        input.placeholder = info?.placeholder || info?.name || 'Gõ văn bản vào ô...';
        setTimeout(() => {
          input.focus();
          if (input.value) input.select?.();
        }, 100);
      }
      showToast(`⌨️ Mở bàn phím gõ vào: ${info?.placeholder || info?.name || 'ô văn bản'}`);
      try { tg?.HapticFeedback?.impactOccurred('light'); } catch {}
    };
