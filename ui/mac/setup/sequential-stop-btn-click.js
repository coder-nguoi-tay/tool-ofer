document.querySelector('#sequential-stop-btn').addEventListener('click', async () => {
      const res = await fetch('/auto-refill/sequential', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      }).then((r) => r.json());
      autoRefillStatus.textContent = res.message;
    });
