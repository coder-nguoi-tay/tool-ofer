// Thread count pills
    document.querySelectorAll('#threadsPills .pill-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#threadsPills .pill-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        inputThreadCount.value = btn.dataset.thread;
        try { tg?.HapticFeedback?.selectionChanged(); } catch (e) {}
      });
    });
