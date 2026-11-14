/**
 * Vẽ KPI lead mới nhất và danh sách lead Toffers (lọc theo ô tìm kiếm, kèm tiến trình màn/nhảy trang theo IP).
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsRenderLeads() {
  const all = miniStatsState.leads;
  const stats = miniStatsState.leadStats;
  const first = all[0] || {};
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('stLeadLatestTime', first.timelead ? new Date(Number(first.timelead) * 1000).toLocaleString('vi-VN') : '--');
  setText('stLeadLatestOffer', first.nameoff || '--');
  setText('stLeadLatestIp', first.ip || '--');
  setText('stLeadLatestUser', `${first.fullname || ''} ${first.username ? `(${first.username})` : ''}`.trim() || '--');
  const ipEl = document.getElementById('stLeadLatestIp');
  if (ipEl) ipEl.dataset.copy = first.ip || '';

  const query = (document.getElementById('stLeadSearch')?.value || '').trim().toLowerCase();
  const list = query
    ? all.filter((item) => `${item.id || ''} ${item.nameoff || ''} ${item.ip || ''} ${item.username || ''} ${item.fullname || ''} ${item.clickid || ''} ${item.geo || ''}`.toLowerCase().includes(query))
    : all;
  setText('badgeLeadListCount', `${list.length} lead`);

  const container = document.getElementById('toffersLeadsContainer');
  if (!container) return;
  if (!list.length) {
    container.innerHTML = `<div style="color:#64748b; font-size:11px;">${all.length ? 'Không tìm thấy lead phù hợp.' : 'Chưa ghi nhận lead nào.'}</div>`;
    return;
  }
  container.innerHTML = list.slice(0, 50).map((item) => {
    const timeStr = item.timelead ? new Date(Number(item.timelead) * 1000).toLocaleString('vi-VN') : '--';
    const flag = item.geo === 'US' ? '🇺🇸' : (item.geo === 'GB' ? '🇬🇧' : '🌐');
    const ip = String(item.ip || '').trim();
    const ipStat = stats[ip.replace(/:\d+$/, '')] || stats[ip] || null;
    const progress = ipStat
      ? `<span style="color:#38bdf8;">📄 Màn ${ipStat.screen || ipStat.completedScreens || 0} • 🔀 ${ipStat.jumpCount || ipStat.pageJumps || 0} nhảy</span>`
      : '';
    const member = [item.fullname, item.username ? `(${item.username})` : ''].filter(Boolean).join(' ');
    return `
      <div style="background:#1e293b; border:1px solid #334155; border-radius:6px; padding:6px 8px; display:flex; align-items:center; justify-content:space-between; gap:6px; font-size:11px;">
        <div style="min-width:0;">
          <div style="font-weight:700; color:#f1f5f9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${flag} ${escHtml(item.nameoff || 'Offer')}</div>
          <div style="font-size:10px; color:#94a3b8; font-family:monospace;">
            IP: <span data-copy="${escHtml(ip)}" onclick="miniStatsCopy(this.dataset.copy)" style="color:#e2e8f0; text-decoration:underline dotted;">${escHtml(ip || '--')}</span> • #${escHtml(item.id || '')} • ${escHtml(timeStr)}
          </div>
          <div style="font-size:10px; color:#94a3b8;">${escHtml(item.geo || '')}${member ? ` • ${escHtml(member)}` : ''} ${progress}</div>
        </div>
        <div style="background:rgba(34,197,94,0.15); border:1px solid rgba(34,197,94,0.4); color:#22c55e; font-weight:800; font-size:12px; padding:2px 8px; border-radius:4px; white-space:nowrap;">
          +${escHtml(item.point || '0')} pt
        </div>
      </div>`;
  }).join('');
}

/**
 * Lưu cookie toffers.top vào localStorage (cùng khoá với desktop) rồi tải lại lead.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsSaveLeadCookie() {
  const val = (document.getElementById('stLeadCookie')?.value || '').trim();
  if (!val) {
    showToast('Cookie đang trống, chưa lưu');
    return;
  }
  localStorage.setItem('toffers_custom_cookie', val);
  showToast('Đã lưu Cookie toffers.top!');
  pollToffersOverview(true);
}

/**
 * Tải file JSON thống kê IP có lead (số màn, số lần nhảy trang) từ GET /lead-stats.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniStatsExportLeadStats() {
  try {
    const res = await (await fetch('/lead-stats')).json();
    const stats = res?.stats || miniStatsState.leadStats;
    if (!Object.keys(stats).length) {
      showToast('Chưa có dữ liệu IP lead nào được lưu.');
      return;
    }
    const a = document.createElement('a');
    a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(stats, null, 2));
    a.download = `autolead-lead-ip-stats-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    showToast('Lỗi xuất dữ liệu: ' + (err.message || err));
  }
}
