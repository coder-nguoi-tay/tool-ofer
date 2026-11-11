// Chuyển đổi tab Bottom Navigation
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        const tabId = item.dataset.tab;
        document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
        item.classList.add('active');
        document.getElementById(tabId).classList.add('active');
        try { tg?.HapticFeedback?.selectionChanged(); } catch (e) {}

        if (tabId === 'tab-screen') {
          if (screenViewMode === 'grid') {
            renderScreenGridCards();
          } else if (!eventSource && activeSessions.length > 0) {
            startStream(currentSlot || activeSessions[0].slot);
          }
        } else if (tabId === 'tab-resources') {
          pollResources();
        } else if (tabId === 'tab-stats') {
          pollLogs();
          pollToffersOverview();
        }
      });
    });
