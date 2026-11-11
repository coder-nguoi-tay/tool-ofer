document.querySelector('#pq-clear-btn')?.addEventListener('click', async () => {
      if (!confirm('Bạn có chắc muốn xóa toàn bộ proxy trong hàng đợi?')) return;
      const res = await fetch('/proxy-queue/clear', { method: 'POST' }).then((r) => r.json());
      const proxyListEl = document.querySelector('[name="proxyList"]');
      if (proxyListEl) proxyListEl.value = '';
      const proxyListEl2 = document.querySelector('#proxy-list');
      if (proxyListEl2) proxyListEl2.value = '';
      status.textContent = res.message ?? 'Đã xóa tất cả proxy.';
      await refreshProxyQueue();
    });
