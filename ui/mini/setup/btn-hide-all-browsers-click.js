// ─── TAB 4: THỐNG KÊ & LOGS ────────────────────────────────────────────────
    document.getElementById('btnHideAllBrowsers').addEventListener('click', async () => {
      const res = await fetch('/browser/hide-all', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      showToast(`Đã thu nhỏ ẩn ngầm ${d.count || 0} cửa sổ`);
    });
