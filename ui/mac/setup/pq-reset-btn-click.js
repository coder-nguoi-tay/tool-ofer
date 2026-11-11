document.querySelector('#pq-reset-btn').addEventListener('click', async () => {
      const proxyList = document.querySelector('#proxy-list')?.value ?? '';
      const res = await fetch('/proxy-queue/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxyList }),
      }).then((r) => r.json());
      status.textContent = res.message ?? 'Đã đặt lại.';
      await refreshProxyQueue();
    });
