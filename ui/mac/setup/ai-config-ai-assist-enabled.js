fetch('/ai/config').then(r => r.json()).then(cfg => {
      if (!cfg) return;
      if (document.querySelector('#ai-assist-enabled')) document.querySelector('#ai-assist-enabled').checked = cfg.enabled !== false && cfg.mode !== 'disabled';
      if (document.querySelector('#ai-cli-select')) document.querySelector('#ai-cli-select').value = cfg.cliBinary || 'codex_mcp';
      if (document.querySelector('#ai-codex-mcp')) document.querySelector('#ai-codex-mcp').checked = cfg.useCodexMcp !== false;
      if (document.querySelector('#ai-mode-select')) document.querySelector('#ai-mode-select').value = cfg.mode || 'auto_on_stuck';
      const savedCloak = localStorage.getItem('autolead_use_cloak') === '1';
      const cloakEl = document.querySelector('#use-cloak-browser');
      if (cloakEl) {
        cloakEl.checked = savedCloak;
        cloakEl.addEventListener('change', (e) => {
          localStorage.setItem('autolead_use_cloak', e.target.checked ? '1' : '0');
        });
      }
    }).catch(() => {});
