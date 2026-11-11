/**
 * Render active slots list.
 * @return {void} Kết quả xử lý render active slots list.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderActiveSlotsList() {
      const container = document.getElementById('activeSlotsList');
      document.getElementById('textSlotCount').textContent = `${activeSessions.length} slot`;
      if (!activeSessions.length) {
        container.innerHTML = '<span style="font-size:12px; color:var(--text-muted);">Hiện không có slot nào đang chạy.</span>';
        return;
      }
      container.innerHTML = activeSessions.map((s) => `
        <div style="background:#1e293b; border:1px solid #334155; padding:8px 10px; border-radius:6px; display:flex; flex-direction:column; gap:6px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div style="font-size:12px; font-weight:700; color:#38bdf8;">Slot ${s.slot} • <span style="color:#f8fafc;">🌐 ${s.exitIp || 'Local'}</span></div>
            <div style="display:flex; gap:6px;">
              <button class="btn btn-primary" style="padding:3px 8px; font-size:11px;" onclick="switchAndStream(${s.slot})">📺 Xem</button>
              <button class="btn btn-danger" style="padding:3px 8px; font-size:11px;" onclick="closeSlotDirect(${s.slot})">🛑</button>
            </div>
          </div>
          <!-- Ảnh màn hình thực tế của IP -->
          <div style="position:relative; width:100%; height:120px; background:#000; border-radius:4px; overflow:hidden; border:1px solid #22324e; cursor:pointer;" onclick="switchAndStream(${s.slot})">
            <img class="ip-screen-thumb" data-slot="${s.slot}" src="/screen/snapshot/${s.slot}?t=${Date.now()}" style="width:100%; height:100%; object-fit:contain; display:block;" onerror="this.style.opacity='0.3'">
            <div style="position:absolute; top:4px; right:4px; background:rgba(15,23,42,0.85); color:#22c55e; font-size:9px; font-weight:700; padding:1px 5px; border-radius:3px; display:inline-flex; align-items:center; gap:3px;">
              <span style="width:5px; height:5px; border-radius:50%; background:#22c55e;"></span> LIVE
            </div>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:10px; color:#94a3b8;">
            <span style="max-width:70%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.websiteUrl || 'N/A'}</span>
            <span style="color:#6ee7b7; font-weight:600;">Trang ${s.currentScreen || 1} • 📶 ${s.bandwidthFormatted || '0 B'}</span>
          </div>
        </div>
      `).join('');
    }
