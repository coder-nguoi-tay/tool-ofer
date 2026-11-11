/**
 * Render agents.
 * @param {*} agents agents.
 * @param {*} pendingTasks pending tasks.
 * @return {void} Kết quả xử lý render agents.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderAgents(agents, pendingTasks) {
      const list = document.querySelector('#agents-list');
      const count = document.querySelector('#agents-count');
      const pending = document.querySelector('#agents-pending');
      const online = agents.filter(a => a.online);
      count.textContent = `(${online.length} online)`;
      pending.textContent = pendingTasks > 0 ? `${pendingTasks} task đang chờ` : '';
      if (agents.length === 0) {
        list.innerHTML = '<p class="hint" style="margin:0;font-size:12px;">Chưa có agent từ xa. Xem lệnh kết nối bên dưới.</p>';
        return;
      }
      const platformIcon = p => ({ darwin: '🍎', win32: '🪟', linux: '🐧' }[p] ?? '🖥');
      list.innerHTML = agents.map(a => `
        <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:12px;">
          <input type="checkbox" id="agent-cb-${a.agentId}" data-agent-id="${a.agentId}" ${a.enabled ? 'checked' : ''} style="cursor:pointer;" title="Bật/tắt agent này">
          <span style="width:8px;height:8px;border-radius:50%;background:${a.online ? '#22c55e' : '#94a3b8'};flex-shrink:0;"></span>
          <span>${platformIcon(a.platform)} <strong>${a.hostname}</strong></span>
          <span class="hint">${a.platform}</span>
          <span style="margin-left:auto;" class="hint">Slot: ${a.freeSlots}/${a.maxSlots} | Task: ${a.activeTasks}</span>
        </div>`).join('');
      // Gắn sự kiện toggle
      list.querySelectorAll('input[type=checkbox][data-agent-id]').forEach(cb => {
        cb.addEventListener('change', async () => {
          await fetch('/agents/config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: cb.dataset.agentId, enabled: cb.checked }),
          });
        });
      });
    }
