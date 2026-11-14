/**
 * Render active slots list: lọc theo offer, dòng IP đang chạy, danh sách slot cho nút AI và chi tiết từng luồng.
 * @return {void} Kết quả xử lý render active slots list.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderActiveSlotsList() {
      const container = document.getElementById('activeSlotsList');
      document.getElementById('textSlotCount').textContent = `${activeSessions.length} slot`;

      const runOffer = miniStatsState.runOffer;
      const offerOf = (s) => String(s.offerNumber || s.streamRole || 1);
      const offerKeys = new Set(['1', ...Object.keys(miniStatsConfiguredOffers())]);
      const offerCounts = {};
      activeSessions.forEach((s) => {
        offerKeys.add(offerOf(s));
        offerCounts[offerOf(s)] = (offerCounts[offerOf(s)] || 0) + 1;
      });
      const pills = document.getElementById('stRunOfferPills');
      if (pills) pills.innerHTML = miniStatsOfferPillsHtml(offerKeys, offerCounts, activeSessions.length, runOffer, 'miniStatsSetRunOffer');
      const ips = activeSessions.filter((s) => s.exitIp).map((s) => `S${s.slot}: ${s.exitIp}`);
      const ipsEl = document.getElementById('stActiveIps');
      if (ipsEl) ipsEl.textContent = `IP đang chạy: ${ips.length ? ips.join(', ') : '--'}`;
      const aiSlot = document.getElementById('stAiSlot');
      if (aiSlot) {
        const cur = aiSlot.value;
        aiSlot.innerHTML = activeSessions.length
          ? activeSessions.map((s) => `<option value="${s.slot}"${String(s.slot) === cur ? ' selected' : ''}>Slot ${s.slot}</option>`).join('')
          : '<option value="">Chưa có slot</option>';
      }

      const visible = runOffer === 'all' ? activeSessions : activeSessions.filter((s) => offerOf(s) === runOffer);
      if (!visible.length) {
        container.innerHTML = `<span style="font-size:12px; color:var(--text-muted);">${runOffer === 'all' ? 'Hiện không có slot nào đang chạy.' : `Không có luồng nào cho Offer ${escHtml(runOffer)}.`}</span>`;
        return;
      }
      container.innerHTML = visible.map((s) => `
        <div style="background:#1e293b; border:1px solid #334155; padding:8px 10px; border-radius:6px; display:flex; flex-direction:column; gap:6px;">
          <div style="display:flex; align-items:center; justify-content:space-between;">
            <div style="font-size:12px; font-weight:700; color:#38bdf8;">Slot ${s.slot} • <span style="color:#f8fafc;">🌐 ${s.exitIp || 'Local'}</span>${s.engine ? ` <span style="color:#a78bfa; font-size:10px;">• ${s.engine}</span>` : ''} <span style="color:#a78bfa; font-size:10px;">• Offer ${escHtml(offerOf(s))}</span></div>
            <div style="display:flex; gap:6px;">
              <button class="btn" style="padding:3px 8px; font-size:11px;" onclick="miniStatsToggleWindow(${s.slot}, ${Boolean(s.isWindowVisible)})">${s.isWindowVisible ? '🔽 Ẩn' : '🖥️ Hiện'}</button>
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
          ${miniStatsSessionDetails(s)}
        </div>
      `).join('');
    }
