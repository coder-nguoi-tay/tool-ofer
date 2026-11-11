// ─── ĐỒNG BỘ TOÀN BỘ TRẠNG THÁI (POLL STATE) ──────────────────────────────

    window.switchAndStream = (slot) => {
      document.querySelectorAll('.nav-item').forEach((i) => i.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach((t) => t.classList.remove('active'));
      document.querySelector('.nav-item[data-tab="tab-screen"]').classList.add('active');
      document.getElementById('tab-screen').classList.add('active');
      switchScreenViewMode('single');
      startStream(slot);
    };
