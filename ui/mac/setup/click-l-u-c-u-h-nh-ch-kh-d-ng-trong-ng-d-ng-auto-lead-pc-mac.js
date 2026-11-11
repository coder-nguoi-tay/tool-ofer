// ────────────────────────────────────────────────────────────────────────

    saveButton.addEventListener('click', () => {
      if (!preferencesBridge) {
        saveStatus.textContent = 'Lưu cấu hình chỉ khả dụng trong ứng dụng AutoLeadPC Mac.';
        saveStatus.classList.add('error');
        return;
      }
      saveStatus.classList.remove('error');
      saveStatus.textContent = 'Đang lưu cấu hình…';
      const values = Object.fromEntries(new FormData(form));
      const settings = Object.fromEntries(savedFieldNames.map((fieldName) => {
        const el = form.elements.namedItem(fieldName);
        if (el && el.type === 'checkbox') return [fieldName, el.checked ? '1' : '0'];
        return [fieldName, values[fieldName] ?? ''];
      }));
      preferencesBridge.postMessage({ action: 'save', settings });
      fetch('/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: document.querySelector('#ai-assist-enabled')?.checked ?? true,
          cliBinary: document.querySelector('#ai-cli-select')?.value ?? 'codex_mcp',
          useCodexMcp: document.querySelector('#ai-codex-mcp')?.checked ?? true,
          mode: document.querySelector('#ai-mode-select')?.value ?? 'auto_on_stuck',
        }),
      }).catch(() => {});
    });
