document.getElementById('btnShowAllBrowsers').addEventListener('click', async () => {
      const res = await fetch('/browser/show-all', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      showToast(`Đã hiện ${d.count || 0} cửa sổ lên màn hình Mac`);
    });
