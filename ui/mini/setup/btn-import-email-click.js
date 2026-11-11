document.getElementById('btnImportEmail').addEventListener('click', async () => {
      const text = document.getElementById('taEmailInput').value.trim();
      if (!text) { alert('Vui lòng dán danh sách email!'); return; }
      const res = await fetch('/email-queue/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailList: text }),
      });
      const d = await res.json();
      showToast(d.message || 'Đã nạp email thành công');
      document.getElementById('taEmailInput').value = '';
      pollResources();
    });
