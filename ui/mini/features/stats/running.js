/**
 * Chọn offer để lọc danh sách luồng đang chạy.
 * @param {string} offer 'all' hoặc số offer.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsSetRunOffer(offer) {
  miniStatsState.runOffer = String(offer);
  renderActiveSlotsList();
}

/**
 * Hiện hoặc thu nhỏ cửa sổ trình duyệt của một slot trên máy Mac.
 * @param {number} slot Số slot.
 * @param {boolean} isVisible Cửa sổ đang hiện (true → thu nhỏ, false → hiện).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniStatsToggleWindow(slot, isVisible) {
  const res = await miniStatsPost(`/browser/${isVisible ? 'hide' : 'show'}/${slot}`);
  const action = isVisible ? 'thu nhỏ cửa sổ' : 'hiện cửa sổ';
  showToast(res.error ? `Lỗi ${action}: ${res.error}` : `Đã ${action} Slot ${slot}`);
  if (!res.error) pollState();
}

/**
 * Trạng thái lead của phiên dạng chữ (cùng logic huy hiệu Trạng thái của desktop).
 * @param {object} s Phiên trong /state chromeSessions.
 * @return {string} Mô tả trạng thái.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsLeadStatusText(s) {
  const screen = `Màn ${s.currentScreen || ((s.completedScreens || 0) + 1)} • ${s.pageJumps || 0} nhảy`;
  if (s.leadCheckStatus === 'confirmed' || s.leadCheckStatus === 'matched') return `🎯 Có lead • ${screen}`;
  if (s.leadCheckStatus === 'checking') return '⏳ Đang kiểm tra lead';
  if (s.leadCheckStatus === 'unmatched') return '⚠️ Lead chưa khớp IP';
  if (s.leadCheckStatus === 'api_error') return '⚠️ Lỗi API lead';
  if (s.leadObserveStatus === 'found') return `🎯 Có lead • ${screen}`;
  if (s.leadObserveStatus === 'waiting' || s.leadObserveStatus === 'api_error') return `⏳ Chờ lead • ${screen}`;
  if (s.leadObserveStatus === 'not_found') return `— Chưa thấy lead • ${screen}`;
  return screen;
}

/**
 * HTML chi tiết của một luồng: thiết bị & trình duyệt, hành động hiện tại, trạng thái lead, email/mật khẩu (nút copy), ghi chú.
 * @param {object} s Phiên trong /state chromeSessions.
 * @return {string} HTML.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsSessionDetails(s) {
  const icons = { windows: '🪟', macos: '🍎', linux: '🐧', android: '🤖', ios: '📱', ipad: '📟', iphone: '📱' };
  const icon = icons[String(s.deviceProfile || '').toLowerCase().replace(/\s+/g, '-')] ?? '🖥️';
  const device = s.deviceVersion || (s.deviceSummary ? s.deviceSummary.split(' · ')[0] : null) || s.deviceProfile || 'Windows 10';
  const engine = s.engine || 'Chrome';
  const ver = String(s.version || '').match(/^(\d+)/)?.[1] || String(s.version || '');
  const browser = !ver ? engine : (ver.includes(engine) ? ver : `${engine} ${ver}`);
  const copyBtn = (val) => `<button class="btn" style="padding:1px 6px; font-size:10px;" data-copy="${escHtml(val)}" onclick="miniStatsCopy(this.dataset.copy)">📋</button>`;
  const email = s.assignedEmail && s.assignedEmail !== '--' ? s.assignedEmail : '';
  const row = (label, html) => `<div style="display:flex; gap:6px; align-items:center;"><span style="color:#64748b; min-width:58px;">${label}</span><span style="min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:#e2e8f0;">${html}</span></div>`;
  return `<div style="display:flex; flex-direction:column; gap:3px; font-size:10.5px;">
    ${row('Thiết bị', `${icon} ${escHtml(device)} · <span style="color:#38bdf8;">${escHtml(browser)}</span>`)}
    ${row('Hành động', `${s.aiRunning ? '<b style="color:#c084fc;">🤖 AI</b> ' : ''}${escHtml(s.action || (s.aiRunning ? 'Đang hỗ trợ điền form' : s.websiteUrl || 'Running'))}`)}
    ${row('Trạng thái', `<b style="color:#6ee7b7;">${escHtml(miniStatsLeadStatusText(s))}</b>`)}
    ${row('Email', email ? `${escHtml(email)} ${copyBtn(email)}` : '--')}
    ${row('Mật khẩu', s.assignedPass ? `${escHtml(s.assignedPass)} ${copyBtn(s.assignedPass)}` : '--')}
    ${row('Ghi chú', escHtml(s.assignedRecover || '--'))}
  </div>`;
}
