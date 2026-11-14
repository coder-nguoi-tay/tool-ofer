/**
 * Tải GET /bandwidth/stats và vẽ chi tiết băng thông.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniStatsFetchBandwidth() {
  try {
    const res = await fetch('/bandwidth/stats');
    if (!res.ok) return;
    miniStatsState.bandwidth = await res.json();
    miniStatsRenderBandwidth();
  } catch (e) {}
}

/**
 * Vẽ băng thông: hôm nay / đang chạy / toàn thời gian, theo slot + tab, host tốn nhất, lịch sử theo ngày.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsRenderBandwidth() {
  const data = miniStatsState.bandwidth;
  if (!data) return;
  const fmt = miniStatsFormatBytes;
  const today = data.today || {};
  const allTime = data.allTime || {};
  const slots = data.activeSlots || [];
  const daily = data.daily || [];
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  const setHtml = (id, val) => { const el = document.getElementById(id); if (el) el.innerHTML = val; };
  const empty = (msg) => `<div style="color:#64748b;">${msg}</div>`;

  setText('stBwToday', data.proxy711?.ok ? (today.proxy711Formatted || fmt(today.proxy711Bytes)) : `~${today.formatted || fmt(today.totalBytes)}`);
  setText('stBwTodaySub', `${data.proxy711?.ok ? '711 thực trừ · app đo' : 'App đo ước tính'}: ${today.formatted || fmt(today.totalBytes)} (↑${today.sentFormatted || fmt(today.bytesSent)} · ↓${today.receivedFormatted || fmt(today.bytesReceived)} · ${(today.requestCount || 0).toLocaleString()} reqs)${today.relayBytes ? ` · Relay: ${today.relayFormatted}` : ''}`);
  setText('stBwActive', fmt(slots.reduce((sum, s) => sum + (s.totalBytes || 0), 0)));
  setText('stBwActiveSub', `${slots.length} luồng (${slots.reduce((sum, s) => sum + (s.tabs?.length || 1), 0)} tab)`);
  setText('stBwAll', allTime.formatted || fmt(allTime.totalBytes));
  setText('stBwAllSub', `${daily.length} ngày · ${(allTime.requestCount || 0).toLocaleString()} reqs`);

  setHtml('stBwSlots', slots.length ? slots.map((s) => `
    <div style="background:#1e293b; border:1px solid #334155; border-radius:6px; padding:6px 8px;">
      <div style="display:flex; justify-content:space-between; gap:6px;">
        <b style="color:#38bdf8;">Slot ${escHtml(s.slot)} · ${escHtml(s.exitIp || 'Direct')}</b>
        <b style="color:#34d399;">${escHtml(s.formatted || fmt(s.totalBytes))}</b>
      </div>
      <div style="color:#94a3b8; font-size:10px;">↑${fmt(s.bytesSent)} · ↓${fmt(s.bytesReceived)} · Relay: ${escHtml(s.relay ? s.relay.formatted : '--')} · ${escHtml(s.proxy || 'Direct')}</div>
      ${(s.tabs || []).map((t, i) => `<div style="font-size:10px; display:flex; justify-content:space-between; gap:6px; border-top:1px dashed #334155; padding-top:2px;">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#e2e8f0;">🌐 Tab ${i + 1}: ${escHtml(t.url || 'Trang trống')}</span>
        <span style="white-space:nowrap; color:#34d399;">${escHtml(t.formatted || fmt(t.totalBytes))}</span>
      </div>`).join('')}
    </div>`).join('') : empty('Không có luồng nào đang hoạt động.'));

  const hosts = data.topHosts || [];
  const hostTotal = hosts.reduce((sum, h) => sum + (h.bytes || 0), 0) || 1;
  setHtml('stBwHosts', hosts.length ? hosts.map((h, i) => `<div style="display:flex; justify-content:space-between; gap:6px;">
    <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${i + 1}. ${escHtml(h.host)}</span>
    <span style="white-space:nowrap;"><b style="color:#fb923c;">${escHtml(h.formatted || fmt(h.bytes))}</b> <span style="color:#94a3b8;">${Math.round((h.bytes || 0) / hostTotal * 100)}%</span></span>
  </div>`).join('') : empty('Chưa có số đo (cần phiên đi qua relay).'));

  const maxDay = Math.max(...daily.map((d) => d.totalBytes || 0), 1);
  setHtml('stBwDaily', daily.length ? daily.map((d) => `<div>
    <div style="display:flex; justify-content:space-between; gap:6px;">
      <span>${escHtml(d.date)}${d.date === today.date ? ' <b style="color:#34d399;">(Hôm nay)</b>' : ''}</span>
      <span><b style="color:#34d399;">${escHtml(d.formatted || fmt(d.totalBytes))}</b>${d.proxy711Bytes ? ` · <b style="color:#fb923c;">711: ${escHtml(d.proxy711Formatted || fmt(d.proxy711Bytes))}</b>` : ''}</span>
    </div>
    <div style="color:#94a3b8; font-size:10px;">↑${escHtml(d.sentFormatted || fmt(d.bytesSent))} · ↓${escHtml(d.receivedFormatted || fmt(d.bytesReceived))} · ${(d.requestCount || 0).toLocaleString()} reqs</div>
    <div style="background:#1e293b; height:5px; border-radius:3px; overflow:hidden;"><div style="background:#10b981; height:100%; width:${Math.round((d.totalBytes || 0) / maxDay * 100)}%;"></div></div>
  </div>`).join('') : empty('Chưa có dữ liệu lịch sử các ngày.'));
}

/**
 * Tải tiêu hao 711 theo giờ (GET /711proxy/consumption?days=) theo khoảng đang chọn và vẽ danh sách.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniStatsLoad711() {
  const box = document.getElementById('stBw711');
  if (!box) return;
  const days = { today: 1, yesterday: 2, '3days': 3, '7days': 7 }[document.getElementById('stBw711Range')?.value] || 1;
  box.innerHTML = '<div style="color:#64748b;">⏳ Đang tải...</div>';
  try {
    const data = await (await fetch(`/711proxy/consumption?days=${days}`)).json();
    if (!data || !data.ok) {
      box.innerHTML = `<div style="color:#ef4444;">⚠️ Lỗi: ${escHtml(data?.error || 'Không nhận được dữ liệu từ server 711proxy')}</div>`;
      return;
    }
    const items = data.items || [];
    const peak = data.peakHour ? `${data.peakHour} (${data.peakFormatted || '--'})` : '--';
    const head = `<div style="color:#cbd5e1;">Tổng: <b style="color:#34d399;">${escHtml(data.totalFormatted || miniStatsFormatBytes(data.totalBytes))}</b> · Đỉnh: <b style="color:#fbbf24;">${escHtml(peak)}</b></div>`;
    if (!items.length) {
      box.innerHTML = head + '<div style="color:#64748b;">Chưa ghi nhận tiêu hao 711 trong khoảng này (số liệu được ghi khi app đang mở).</div>';
      return;
    }
    const max = Math.max(...items.map((i) => i.bytes || 0), 1);
    box.innerHTML = head + items.map((item) => {
      const bytes = item.bytes || 0;
      const isPeak = (data.peakBytes || 0) > 0 && bytes === data.peakBytes;
      return `<div style="${bytes ? '' : 'color:#64748b;'}">
        <div style="display:flex; justify-content:space-between;"><span>🕒 ${escHtml(item.localTime || item.period)}${isPeak ? ' <b style="color:#fbbf24;">Đỉnh</b>' : ''}</span><b style="color:${isPeak ? '#fbbf24' : '#34d399'};">${escHtml(item.formatted || miniStatsFormatBytes(bytes))} · ${item.percent || 0}%</b></div>
        <div style="background:#1e293b; height:4px; border-radius:2px; overflow:hidden;"><div style="background:${isPeak ? '#f59e0b' : '#38bdf8'}; height:100%; width:${Math.round(bytes / max * 100)}%;"></div></div>
      </div>`;
    }).join('');
  } catch (err) {
    box.innerHTML = `<div style="color:#ef4444;">⚠️ Lỗi kết nối: ${escHtml(err.message)}</div>`;
  }
}

/**
 * Đặt lại số liệu băng thông (POST /bandwidth/reset {scope}) sau khi xác nhận.
 * @param {'today'|'all'} scope Phạm vi đặt lại.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniStatsResetBandwidth(scope) {
  const ok = await miniStatsConfirm(scope === 'today'
    ? 'Đặt lại bộ đếm băng thông của ngày HÔM NAY về 0?'
    : 'XOÁ TOÀN BỘ lịch sử thống kê băng thông tất cả các ngày? Không thể hoàn tác.');
  if (!ok) return;
  const res = await miniStatsPost('/bandwidth/reset', { scope });
  showToast(res.ok ? (res.message || 'Đã đặt lại dữ liệu băng thông.') : 'Lỗi: ' + (res.error || 'Không thực hiện được.'));
  if (res.ok) {
    miniStatsFetchBandwidth();
    pollState();
  }
}

/**
 * Mở/đóng khối chi tiết băng thông: khi mở thì tải ngay và tự làm mới 3 giây/lần (chỉ khi đang ở tab Thống kê), khi đóng thì dừng.
 * @param {boolean} open Khối đang mở hay không.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsToggleBandwidth(open) {
  clearInterval(miniStatsState.bandwidthTimer);
  miniStatsState.bandwidthTimer = null;
  if (!open) return;
  miniStatsFetchBandwidth();
  miniStatsState.bandwidthTimer = setInterval(() => {
    if (document.getElementById('tab-stats')?.classList.contains('active')) miniStatsFetchBandwidth();
  }, 3000);
}
