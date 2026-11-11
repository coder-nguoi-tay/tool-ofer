window.triggerPageScroll = (direction) => {
      sendInput({ type: 'scrollPage', direction });
      const labels = { top: 'Đầu trang', bottom: 'Đáy trang', up: 'Cuộn lên', down: 'Cuộn xuống' };
      showToast(`📜 ${labels[direction] || direction}`);
      try { tg?.HapticFeedback?.impactOccurred('light'); } catch {}
    };
