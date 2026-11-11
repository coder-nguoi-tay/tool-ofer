document.querySelector('#eq-reset-btn').addEventListener('click', async () => {
      const res = await fetch('/email-queue/reset', { method: 'POST' }).then((r) => r.json());
      status.textContent = res.message ?? 'Đã đặt lại.';
      await refreshEmailQueue();
    });
