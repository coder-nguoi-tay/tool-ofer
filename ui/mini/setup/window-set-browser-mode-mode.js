// ─── TAB 2: VẬN HÀNH & CẤU HÌNH ─────────────────────────────────────────────
    const MINI_BROWSER_MODES = {
      Chrome: { pill: 'pillBrowserChrome', radio: 'radioChrome', label: '🌐 Google Chrome', color: '#38bdf8' },
      GoLogin: { pill: 'pillBrowserGoLogin', radio: 'radioGoLogin', label: '🚀 GoLogin Orbita', color: '#a78bfa' },
    };
    window.setBrowserMode = (mode) => {
      // Cấu hình cũ có thể lưu 'gologin'/'Gologin'; mode lạ (kể cả AdsPower cũ, server luôn chạy Chrome) quay về Chrome.
      const key = Object.keys(MINI_BROWSER_MODES).find(name => name.toLowerCase() === String(mode).toLowerCase()) || 'Chrome';
      currentBrowserMode = key;
      for (const [name, item] of Object.entries(MINI_BROWSER_MODES)) {
        document.getElementById(item.pill)?.classList.toggle('active', name === key);
        const radio = document.getElementById(item.radio);
        if (radio) radio.checked = name === key;
      }
      const badge = document.getElementById('badgeBrowserMode');
      badge.textContent = MINI_BROWSER_MODES[key].label;
      badge.style.color = MINI_BROWSER_MODES[key].color;
      try { tg?.HapticFeedback?.selectionChanged(); } catch (e) {}
    };
