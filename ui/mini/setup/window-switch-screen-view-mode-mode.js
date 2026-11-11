// Chuyển đổi giữa chế độ Lưới tất cả IP và Màn hình trực tiếp 1 IP
    window.switchScreenViewMode = (mode) => {
      screenViewMode = mode;
      const btnGrid = document.getElementById('btnViewGrid');
      const btnSingle = document.getElementById('btnViewSingle');
      const viewGrid = document.getElementById('screenGridView');
      const viewSingle = document.getElementById('screenSingleView');

      if (mode === 'grid') {
        if (btnGrid) {
          btnGrid.classList.add('btn-primary');
          btnGrid.style.background = '';
          btnGrid.style.color = '';
        }
        if (btnSingle) {
          btnSingle.classList.remove('btn-primary');
          btnSingle.style.background = '#1e293b';
          btnSingle.style.color = '#94a3b8';
        }

        if (viewGrid) viewGrid.style.display = 'flex';
        if (viewSingle) viewSingle.style.display = 'none';

        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        if (eventSource) {
          try { eventSource.close(); } catch {}
          eventSource = null;
        }
        renderScreenGridCards();
      } else {
        if (btnSingle) {
          btnSingle.classList.add('btn-primary');
          btnSingle.style.background = '';
          btnSingle.style.color = '';
        }
        if (btnGrid) {
          btnGrid.classList.remove('btn-primary');
          btnGrid.style.background = '#1e293b';
          btnGrid.style.color = '#94a3b8';
        }

        if (viewGrid) viewGrid.style.display = 'none';
        if (viewSingle) viewSingle.style.display = 'flex';

        if (activeSessions.length > 0) {
          const slotToStream = currentSlot || activeSessions[0].slot;
          startStream(slotToStream);
        }
      }
      try { tg?.HapticFeedback?.selectionChanged(); } catch (e) {}
    };
