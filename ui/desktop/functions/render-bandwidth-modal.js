/**
 * Render bandwidth modal.
 * @return {void} Kết quả xử lý render bandwidth modal.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderBandwidthModal() {
      const data = window.cachedBandwidthStats;
      if (!data) return;

      const today = data.today || {};
      const allTime = data.allTime || {};
      const activeSlots = data.activeSlots || [];
      const dailyList = data.daily || [];

      // Update 711Proxy Bandwidth Metrics
      if (data.proxy711) {
        update711BalanceDisplay(data.proxy711);
      } else if (window.cached711Balance) {
        update711BalanceDisplay(window.cached711Balance);
      }

      // Update Top Stat Cards
      const elTodayDate = document.getElementById('bwStatTodayDate');
      if (elTodayDate) elTodayDate.textContent = today.date || 'Hôm nay';

      const elTodayTotal = document.getElementById('bwStatTodayTotal');
      if (elTodayTotal) elTodayTotal.textContent = bandwidthTodayLabel(data);

      const elTodaySub = document.getElementById('bwStatTodaySub');
      if (elTodaySub) {
        const upStr = today.sentFormatted || formatBytes(today.bytesSent || 0);
        const downStr = today.receivedFormatted || formatBytes(today.bytesReceived || 0);
        const reqStr = (today.requestCount || 0).toLocaleString();
        const estStr = today.formatted || formatBytes(today.totalBytes || 0);
        const relayStr = today.relayBytes ? ` · Relay đo: ${today.relayFormatted}` : '';
        elTodaySub.textContent = data.proxy711?.ok
          ? `711 thực trừ · App đo ước tính: ${estStr} (↑${upStr} · ↓${downStr} · ${reqStr} reqs)${relayStr}`
          : `Ước tính app đo (chưa kết nối 711) · ↑ ${upStr} · ↓ ${downStr} · ${reqStr} reqs${relayStr}`;
      }

      // Active Slots Card
      const activeBytesTotal = activeSlots.reduce((sum, s) => sum + (s.totalBytes || 0), 0);
      const elActiveTotal = document.getElementById('bwStatActiveTotal');
      if (elActiveTotal) elActiveTotal.textContent = formatBytes(activeBytesTotal);

      const elActiveSub = document.getElementById('bwStatActiveSub');
      if (elActiveSub) elActiveSub.textContent = `${activeSlots.length} luồng đang mở (${activeSlots.reduce((sum, s) => sum + (s.tabs?.length || 1), 0)} tabs)`;

      // All-Time Card
      const elAllTimeTotal = document.getElementById('bwStatAllTimeTotal');
      if (elAllTimeTotal) elAllTimeTotal.textContent = allTime.formatted || formatBytes(allTime.totalBytes || 0);

      const elAllTimeSub = document.getElementById('bwStatAllTimeSub');
      if (elAllTimeSub) {
        const daysCount = dailyList.length;
        const totalReqs = (allTime.requestCount || 0).toLocaleString();
        elAllTimeSub.textContent = `${daysCount} ngày ghi nhận · ${totalReqs} requests`;
      }

      // Sub-Tabs counts
      const elSlotsCount = document.getElementById('bwTabSlotsCount');
      if (elSlotsCount) elSlotsCount.textContent = activeSlots.length;

      const elDailyCount = document.getElementById('bwTabDailyCount');
      if (elDailyCount) elDailyCount.textContent = dailyList.length;

      // Render Active Slots Table
      const slotsTbody = document.getElementById('bwTableSlotsBody');
      if (slotsTbody) {
        if (activeSlots.length === 0) {
          slotsTbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:25px;color:#94a3b8;">Không có luồng nào đang hoạt động.</td></tr>';
        } else {
          slotsTbody.innerHTML = activeSlots.map(s => {
            const isHighlighted = _bandwidthModalHighlightSlot && s.slot === _bandwidthModalHighlightSlot;
            const bgStyle = isHighlighted ? 'background:rgba(16,185,129,0.18);' : '';
            const upStr = formatBytes(s.bytesSent || 0);
            const downStr = formatBytes(s.bytesReceived || 0);
            const totalStr = s.formatted || formatBytes(s.totalBytes || 0);
            const tabs = s.tabs || [];
            const tabsCount = tabs.length || 1;

            const tabsHtml = tabs.length > 0
              ? tabs.map((t, idx) => {
                const tTotal = t.formatted || formatBytes(t.totalBytes || 0);
                const tUp = formatBytes(t.bytesSent || 0);
                const tDown = formatBytes(t.bytesReceived || 0);
                const urlLabel = t.url ? (t.url.length > 45 ? t.url.slice(0, 45) + '...' : t.url) : 'Trang trống';
                return `<div style="font-size:10.5px;padding:2px 0;border-bottom:1px dashed #334155;display:flex;justify-content:space-between;gap:8px;">
                    <span style="color:#f8fafc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(t.url)}">🌐 Tab ${idx + 1}: ${escHtml(urlLabel)}</span>
                    <span style="white-space:nowrap;"><b style="color:#34d399;">${tTotal}</b> <span style="color:#94a3b8;font-size:9.5px;">(↑${tUp} · ↓${tDown})</span></span>
                  </div>`;
              }).join('')
              : '<span style="color:#94a3b8;font-size:10px;">1 tab</span>';

            return `
              <tr style="${bgStyle}">
                <td style="text-align:center;font-weight:700;"><span class="run-slot-badge">Slot ${s.slot}</span></td>
                <td><span class="run-ip-chip">${escHtml(s.exitIp || 'Direct')}</span></td>
                <td style="font-size:10.5px;color:#cbd5e1;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escHtml(s.proxy)}">${escHtml(s.proxy || 'Direct')}</td>
                <td style="text-align:center;"><span style="font-size:10px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;padding:1px 6px;border-radius:10px;font-weight:600;">${tabsCount}</span></td>
                <td style="text-align:right;font-size:11px;color:#94a3b8;">${upStr}</td>
                <td style="text-align:right;font-size:11px;color:#94a3b8;">${downStr}</td>
                <td style="text-align:right;font-weight:800;font-size:11.5px;color:#34d399;">${totalStr}</td>
                <td style="text-align:right;font-weight:800;font-size:11.5px;color:#fb923c;" title="${s.relay ? escHtml((s.relay.hosts || []).map(h => `${h.host}: ${formatBytes(h.bytes)}`).join('\n')) : 'Phiên không qua relay'}">${s.relay ? s.relay.formatted : '--'}</td>
                <td><div style="max-height:80px;overflow-y:auto;">${tabsHtml}</div></td>
              </tr>
            `;
          }).join('');
        }
      }

      // Host tốn nhất hôm nay (đo tại relay)
      const hostsTbody = document.getElementById('bwTableHostsBody');
      if (hostsTbody) {
        const hosts = data.topHosts || [];
        const hostTotal = hosts.reduce((sum, h) => sum + (h.bytes || 0), 0) || 1;
        hostsTbody.innerHTML = hosts.length
          ? hosts.map((h, i) => `<tr><td style="text-align:center;color:#94a3b8;">${i + 1}</td><td style="font-size:11px;color:#f8fafc;">${escHtml(h.host)}</td><td style="text-align:right;font-weight:700;color:#fb923c;">${h.formatted || formatBytes(h.bytes)}</td><td style="text-align:right;font-size:10.5px;color:#94a3b8;">${Math.round(h.bytes / hostTotal * 100)}%</td></tr>`).join('')
          : '<tr><td colspan="4" style="text-align:center;padding:14px;color:#94a3b8;">Chưa có số đo (cần phiên đi qua relay).</td></tr>';
      }

      // Render Daily History Table
      const dailyTbody = document.getElementById('bwTableDailyBody');
      if (dailyTbody) {
        if (dailyList.length === 0) {
          dailyTbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:25px;color:#94a3b8;">Chưa có dữ liệu lịch sử các ngày.</td></tr>';
        } else {
          const maxDayBytes = Math.max(...dailyList.map(d => d.totalBytes || 0), 1);
          const allBytes = allTime.totalBytes || 1;

          dailyTbody.innerHTML = dailyList.map(d => {
            const isToday = d.date === today.date;
            const dateLabel = isToday ? `<b>${d.date}</b> <span style="font-size:9.5px;background:rgba(16,185,129,0.2);color:#34d399;border:1px solid rgba(16,185,129,0.3);padding:1px 5px;border-radius:3px;font-weight:700;">Hôm nay</span>` : d.date;
            const totalStr = d.formatted || formatBytes(d.totalBytes || 0);
            const upStr = d.sentFormatted || formatBytes(d.bytesSent || 0);
            const downStr = d.receivedFormatted || formatBytes(d.bytesReceived || 0);
            const reqCount = (d.requestCount || 0).toLocaleString();
            const pct = Math.min(100, Math.round(((d.totalBytes || 0) / allBytes) * 100));
            const barWidth = Math.min(100, Math.round(((d.totalBytes || 0) / maxDayBytes) * 100));

            return `
              <tr style="${isToday ? 'background:rgba(16,185,129,0.12);' : ''}">
                <td style="white-space:nowrap;">${dateLabel}</td>
                <td style="text-align:right;font-size:11px;color:#94a3b8;">${upStr}</td>
                <td style="text-align:right;font-size:11px;color:#94a3b8;">${downStr}</td>
                <td style="text-align:right;font-weight:800;font-size:12px;color:#34d399;">${totalStr}</td>
                <td style="text-align:right;font-weight:800;font-size:12px;color:#fb923c;">${d.proxy711Bytes ? (d.proxy711Formatted || formatBytes(d.proxy711Bytes)) : '--'}</td>
                <td style="text-align:center;font-size:11px;font-weight:600;color:#cbd5e1;">${reqCount}</td>
                <td>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <div style="flex:1;background:#1e293b;height:8px;border-radius:4px;overflow:hidden;">
                      <div style="background:linear-gradient(90deg, #10b981 0%, #059669 100%);height:100%;width:${barWidth}%;"></div>
                    </div>
                    <span style="font-size:10px;color:#94a3b8;min-width:32px;text-align:right;">${pct}%</span>
                  </div>
                </td>
              </tr>
            `;
          }).join('');
        }
      }
    }
