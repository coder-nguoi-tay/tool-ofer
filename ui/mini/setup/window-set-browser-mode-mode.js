// ─── TAB 2: VẬN HÀNH & CẤU HÌNH ─────────────────────────────────────────────
    window.setBrowserMode = (mode) => {
      currentBrowserMode = mode;
      const isAdsPower = mode === 'AdsPower';
      document.getElementById('pillBrowserAdsPower').classList.toggle('active', isAdsPower);
      document.getElementById('pillBrowserChrome').classList.toggle('active', !isAdsPower);
      document.getElementById('radioAdsPower').checked = isAdsPower;
      document.getElementById('radioChrome').checked = !isAdsPower;
      const badge = document.getElementById('badgeBrowserMode');
      badge.textContent = isAdsPower ? '🛡️ AdsPower SunBrowser' : '🌐 Google Chrome';
      badge.style.color = isAdsPower ? '#22c55e' : '#38bdf8';
      try { tg?.HapticFeedback?.selectionChanged(); } catch (e) {}
    };
