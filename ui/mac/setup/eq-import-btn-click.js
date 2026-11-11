document.querySelector('#eq-import-btn').addEventListener('click', async () => {
      const emailList = eqInputList?.value.trim() ?? '';
      if (!emailList) { status.textContent = 'Hãy nhập danh sách email trước.'; return; }
      const res = await fetch('/email-queue/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ emailList }),
      }).then((r) => r.json());
      status.textContent = res.message ?? 'Đã nhập.';
      await refreshEmailQueue();
    });
