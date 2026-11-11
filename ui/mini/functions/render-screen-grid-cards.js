/**
 * Render screen grid cards.
 * @return {void} Kết quả xử lý render screen grid cards.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderScreenGridCards() {
      const container = document.getElementById('screenGridCards');
      const emptyEl = document.getElementById('screenGridEmpty');
      if (!container) return;

      if (!activeSessions.length) {
        container.innerHTML = '';
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      if (emptyEl) emptyEl.style.display = 'none';

      container.innerHTML = activeSessions.map((s) => {
        let statusBadge = '';
        if (s.leadCheckStatus === 'confirmed' || s.leadObserveStatus === 'found') {
          statusBadge = '<span style="background:rgba(34,197,94,0.2); border:1px solid #22c55e; color:#22c55e; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">✅ Có lead</span>';
        } else if (s.leadCheckStatus === 'checking' || s.leadObserveStatus === 'waiting') {
          statusBadge = '<span style="background:rgba(245,158,11,0.2); border:1px solid #f59e0b; color:#f59e0b; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">⏳ Đang check lead</span>';
        } else if (s.completedScreens > 0) {
          statusBadge = `<span style="background:rgba(56,189,248,0.2); border:1px solid #38bdf8; color:#38bdf8; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px;">📄 Màn ${s.completedScreens + 1}/4</span>`;
        } else {
          statusBadge = `<span style="background:#1e293b; color:#94a3b8; font-size:10px; padding:2px 6px; border-radius:4px;">Offer ${s.offerNumber || 1}</span>`;
        }

        return `
          <div class="card" style="padding:10px; margin-bottom:0; display:flex; flex-direction:column; gap:8px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:6px;">
                <span class="badge" style="background:#0284c7; color:#ffffff; font-weight:700;">Slot ${s.slot}</span>
                <span style="font-size:12px; font-weight:700; color:#38bdf8;">🌐 ${s.exitIp || 'Local'}</span>
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${statusBadge}
                <button class="btn btn-danger" style="padding:2px 6px; font-size:10px; font-weight:700;" onclick="closeSlotDirect(${s.slot})">✕</button>
              </div>
            </div>

            <!-- Khung hình màn hình thực tế của IP -->
            <div style="position:relative; width:100%; aspect-ratio:16/9; background:#000; border-radius:6px; overflow:hidden; border:1px solid #22324e; cursor:pointer;" onclick="switchAndStream(${s.slot})">
              <img class="ip-screen-thumb" data-slot="${s.slot}" src="/screen/snapshot/${s.slot}?t=${Date.now()}" style="width:100%; height:100%; object-fit:contain; display:block;" onerror="this.style.opacity='0.3'">
              <div style="position:absolute; top:6px; right:6px; background:rgba(15,23,42,0.85); border:1px solid #334155; color:#22c55e; font-size:10px; font-weight:700; padding:2px 6px; border-radius:4px; display:inline-flex; align-items:center; gap:4px;">
                <span style="width:6px; height:6px; border-radius:50%; background:#22c55e;"></span> LIVE
              </div>
              <div style="position:absolute; bottom:6px; left:6px; right:6px; display:flex; justify-content:space-between; align-items:center; pointer-events:none;">
                <span style="background:rgba(15,23,42,0.85); color:#cbd5e1; font-size:10px; padding:2px 6px; border-radius:4px; max-width:70%; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${s.websiteUrl || 'Đang mở trang...'}
                </span>
                <span style="background:rgba(6,78,59,0.85); color:#6ee7b7; font-size:10px; font-weight:600; padding:2px 6px; border-radius:4px;">
                  📶 ${s.bandwidthFormatted || '0 B'}
                </span>
              </div>
            </div>

            <!-- Nút bấm tương tác chi tiết -->
            <button class="btn btn-primary" style="width:100%; padding:7px; font-size:11.5px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px;" onclick="switchAndStream(${s.slot})">
              <span>📺 Mở Màn Hình Điều Khiển Slot ${s.slot} (Chạm &amp; Gõ)</span>
            </button>
          </div>
        `;
      }).join('');
    }
