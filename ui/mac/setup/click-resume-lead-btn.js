document.addEventListener('click', async (event) => {
      const btn = event.target.closest('.resume-lead-btn');
      if (!btn) return;
      const slot = btn.dataset.slot;
      try {
        btn.disabled = true;
        btn.textContent = '...';
        await fetch('/lead-check/resume', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ slot }),
        });
        await refreshAutoRefillState();
      } catch (err) {
        alert('Lỗi: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'Tiếp tục fill';
      }
    });
