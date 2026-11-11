window.setInteractionMode = (mode) => {
      currentInteractionMode = mode;
      document.getElementById('modeTouch')?.classList.toggle('active', mode === 'touch');
      document.getElementById('modeTrackpad')?.classList.toggle('active', mode === 'trackpad');
      document.getElementById('modeScroll')?.classList.toggle('active', mode === 'scroll');

      if (mode === 'trackpad') {
        if (virtualCursor) virtualCursor.style.display = 'block';
        if (trackpadActionBar) trackpadActionBar.style.display = 'flex';
        updateVirtualCursorDisplay();
      } else {
        if (virtualCursor) virtualCursor.style.display = 'none';
        if (trackpadActionBar) trackpadActionBar.style.display = 'none';
      }
      try { tg?.HapticFeedback?.selectionChanged(); } catch {}
      showToast(`Chế độ: ${mode === 'touch' ? '👆 Chạm trực tiếp' : (mode === 'trackpad' ? '🖱️ Chuột ảo (Trackpad)' : '📜 Cuộn trang')}`);
    };
