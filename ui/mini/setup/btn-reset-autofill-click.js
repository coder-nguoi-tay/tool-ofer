// ─── TAB 3: TÀI NGUYÊN (RESOURCES) ──────────────────────────────────────────

    document.getElementById('btnResetAutofill').addEventListener('click', async () => {
      const res = await fetch('/autofill-queue/reset', { method: 'POST' });
      const d = await res.json().catch(() => ({}));
      showToast(d.message || 'Đã reset hàng đợi Autofill');
      pollResources();
    });
