inputThreadCount.addEventListener('input', () => {
      const val = inputThreadCount.value;
      document.querySelectorAll('#threadsPills .pill-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.thread === val);
      });
    });
