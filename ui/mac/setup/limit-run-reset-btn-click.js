// ── limitRun reset ───────────────────────────────────────────────────
    document.getElementById('limit-run-reset-btn').addEventListener('click', async () => {
      try {
        const res = await fetch('/limit-run/reset', { method: 'POST' }).then((r) => r.json());
        document.getElementById('lr-count').textContent = '0';
        document.getElementById('lr-max').textContent = '0 (không giới hạn)';
        status.textContent = res.message ?? 'Đã đặt lại bộ đếm.';
      } catch (e) {
        status.textContent = 'Lỗi đặt lại: ' + e.message;
      }
    });
