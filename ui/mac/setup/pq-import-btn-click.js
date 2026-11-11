document.querySelector('#pq-import-btn').addEventListener('click', async () => {
      const proxyListEl = document.querySelector('[name="proxyList"]');
      const proxyTypeEl = document.querySelector('[name="proxyType"]');
      if (!proxyListEl?.value.trim()) { status.textContent = 'Hãy nhập danh sách proxy trước.'; return; }
      const res = await fetch('/proxy-queue/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proxyList: proxyListEl.value, proxyType: proxyTypeEl?.value ?? 'socks5' }),
      }).then((r) => r.json());
      status.textContent = res.message ?? 'Đã nhập.';
      await refreshProxyQueue();
    });
