document.getElementById('btnImportProxy').addEventListener('click', async () => {
      const text = document.getElementById('taProxyInput').value.trim();
      if (!text) { alert('Vui lòng dán danh sách proxy!'); return; }
      const res = await fetch('/proxy-queue/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proxyList: text }),
      });
      const d = await res.json();
      showToast(d.message || 'Đã nạp proxy thành công');
      document.getElementById('taProxyInput').value = '';
      pollResources();
    });
