/**
 * Poll logs.
 * @return {Promise<void>} Kết quả xử lý poll logs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function pollLogs() {
      try {
        const res = await fetch('/browser-logs');
        if (!res.ok) return;
        const data = await res.json();
        const box = document.getElementById('logBox');
        const sessions = data.sessions || [];
        const lines = [];
        sessions.slice(0, 5).forEach((s) => {
          (s.logs || []).slice(-4).forEach((l) => {
            const time = (l.time || '').slice(11, 19);
            lines.push(`<div><span style="color:#64748b;">${time}</span> [${s.ip || 'Local'}] <b style="color:#38bdf8;">${l.type}</b>: ${String(l.detail || l.url || '').slice(0, 80)}</div>`);
          });
        });
        box.innerHTML = lines.length ? lines.join('') : '<div style="color:#64748b;">Chưa có log mới.</div>';
      } catch (e) {}
    }
