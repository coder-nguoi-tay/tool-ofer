// ─── Device profiles ────────────────────────────────────────────────────
    (async () => {
      const data = await fetch('/device-profiles').then(r => r.json()).catch(() => ({ selected: ['windows'] }));
      const cbs = document.querySelectorAll('#device-profile-checkboxes input[type=checkbox]');
      cbs.forEach(cb => { cb.checked = data.selected.includes(cb.value); });

      async function saveDeviceProfiles() {
        const selected = [...document.querySelectorAll('#device-profile-checkboxes input:checked')].map(c => c.value);
        if (selected.length === 0) { this.checked = true; return; } // ít nhất 1
        await fetch('/device-profiles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profiles: selected }),
        });
      }
      cbs.forEach(cb => cb.addEventListener('change', saveDeviceProfiles));
    })();
