/**
 * Gộp phản hồi /browser-logs vào danh sách đang có (giống mergeLogDelta của desktop): phản hồi đủ thay toàn bộ;
 * phản hồi phần mới nối/thay sự kiện theo id, thêm phiên mới lên đầu, bỏ phiên không còn trong `ids`.
 * @param {object[]} current Danh sách phiên đang có.
 * @param {object} res Phản hồi của /browser-logs.
 * @return {{logData: object[], changed: boolean}} Danh sách mới và có thay đổi hay không.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsMergeLogDelta(current, res) {
  if (res.since === undefined) return { logData: res.sessions, changed: true };
  const ids = new Set(res.ids || []);
  const kept = current.filter((session) => ids.has(session.id));
  const changed = kept.length !== current.length || res.sessions.length > 0;
  for (const incoming of res.sessions) {
    const existing = kept.find((session) => session.id === incoming.id);
    if (!existing) { kept.unshift(incoming); continue; }
    Object.assign(existing, incoming, { logs: existing.logs || [] });
    for (const entry of incoming.logs) {
      const index = existing.logs.findIndex((item) => item.id === entry.id);
      if (index >= 0) existing.logs[index] = entry; else existing.logs.push(entry);
    }
  }
  return { logData: kept, changed };
}

/**
 * Chuyển log của một sự kiện thành mô tả ngắn để hiện trên mobile.
 * @param {object} entry Sự kiện log.
 * @return {string} Mô tả (chưa escape).
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsLogDetail(entry) {
  if (entry.type === 'navigate') return entry.url || '';
  if (entry.type === 'field_filled') return `[${entry.id || entry.name || ''}] = ${entry.text || entry.value || ''}`;
  if (entry.type === 'checkbox_checked') return `Đã tích: ${entry.id || entry.name || 'consent'} ${entry.text || ''}`.trim();
  return entry.detail || `${entry.tag || ''} ${entry.text || ''}`.trim() || entry.url || '';
}

/**
 * Vẽ phần Log: pill offer, KPI (lượt chạy/lead/bị chặn/AI), bộ lọc slot, danh sách log mới nhất trước (tối đa 100 dòng)
 * và cập nhật link Export CSV / nhãn nút theo offer đang chọn.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsRenderLogs() {
  const st = miniStatsState;
  const box = document.getElementById('logBox');
  const slotEl = document.getElementById('stLogSlot');
  if (!box || !slotEl) return;
  const slotFilter = slotEl.value;
  const typeFilter = document.getElementById('stLogType')?.value || '';
  const off = st.logOffer;
  const isAll = off === 'all';

  const offerKeys = new Set(['1', ...Object.keys(miniStatsConfiguredOffers())]);
  const perOffer = {};
  const slots = new Set();
  const kpi = { runs: 0, leads: 0, blocked: 0, ai: 0 };
  const rows = [];
  let total = 0;
  for (const session of st.logs) {
    const sessOffer = String(session.offer || 1);
    offerKeys.add(sessOffer);
    slots.add(String(session.slot));
    let inOffer = isAll || sessOffer === off;
    for (const entry of session.logs || []) {
      const entryOffer = String(entry.offer ?? sessOffer);
      offerKeys.add(entryOffer);
      perOffer[entryOffer] = (perOffer[entryOffer] || 0) + 1;
      total++;
      if (!isAll && entryOffer !== off) continue;
      inOffer = true;
      const type = String(entry.type || '');
      if (type === 'lead_confirmed') kpi.leads++;
      else if (type === 'traffic_blocked' || type === 'ai_error') kpi.blocked++;
      if (type.startsWith('ai_')) kpi.ai++;
      if (slotFilter && String(session.slot) !== slotFilter) continue;
      if (typeFilter && type !== typeFilter) continue;
      rows.push({ session, entry, offer: entryOffer });
    }
    if (inOffer) kpi.runs++;
  }

  const pills = document.getElementById('stLogOfferPills');
  if (pills) pills.innerHTML = miniStatsOfferPillsHtml(offerKeys, perOffer, total, off, 'miniStatsSetLogOffer');
  [['stLogKpiRuns', kpi.runs], ['stLogKpiLeads', kpi.leads], ['stLogKpiBlocked', kpi.blocked], ['stLogKpiAi', kpi.ai]].forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  });

  slotEl.innerHTML = '<option value="">Tất cả slot</option>'
    + [...slots].sort((a, b) => Number(a) - Number(b)).map((s) => `<option value="${escHtml(s)}"${s === slotFilter ? ' selected' : ''}>Slot ${escHtml(s)}</option>`).join('');

  const scopeLabel = isAll ? '' : ` (Offer ${off})`;
  const csv = document.getElementById('stLogCsv');
  if (csv) {
    csv.href = isAll ? '/browser-logs/export-csv' : `/browser-logs/export-csv?offer=${encodeURIComponent(off)}`;
    csv.textContent = `📄 CSV${scopeLabel}`;
  }
  const clearBtn = document.getElementById('btnClearLogs');
  if (clearBtn) clearBtn.textContent = `🗑 Xoá log${scopeLabel}`;
  const countEl = document.getElementById('stLogCount');
  if (countEl) countEl.textContent = `${rows.length} dòng`;

  if (!rows.length) {
    box.innerHTML = `<div style="color:#64748b;">${isAll ? 'Chưa có log thao tác trình duyệt.' : `Chưa có log cho Offer ${escHtml(off)}.`}</div>`;
    return;
  }
  rows.sort((a, b) => String(b.entry.time || '').localeCompare(String(a.entry.time || '')));
  box.innerHTML = rows.slice(0, 100).map(({ session, entry, offer }) => {
    const time = entry.time ? new Date(entry.time).toLocaleTimeString('vi-VN') : '--';
    const device = session.deviceVersion || session.deviceProfile || '';
    const type = miniStatsLogTypes[entry.type] || entry.type || 'log';
    const color = /blocked|error|failed/.test(entry.type || '') ? '#f87171' : (entry.type === 'lead_confirmed' ? '#34d399' : '#38bdf8');
    const file = entry.htmlFilename ? ` <span style="color:#94a3b8;">📄 ${escHtml(entry.htmlFilename)}</span>` : '';
    return `<div style="border-bottom:1px dashed #1e293b; padding:3px 0;">
      <div><span style="color:#64748b;">${escHtml(time)}</span> · Slot ${escHtml(session.slot)} · ${escHtml(session.ip || 'Local')}${device ? ` · ${escHtml(device)}` : ''} · <span style="color:#a78bfa;">Offer ${escHtml(offer)}</span></div>
      <div><b style="color:${color};">${escHtml(type)}</b> <span style="color:#e2e8f0;">${escHtml(miniStatsLogDetail(entry).slice(0, 200))}</span>${file}</div>
    </div>`;
  }).join('');
}

/**
 * Chọn offer để lọc log/KPI và phạm vi Export/Mở thư mục/Xoá log.
 * @param {string} offer 'all' hoặc số offer.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsSetLogOffer(offer) {
  miniStatsState.logOffer = String(offer);
  miniStatsRenderLogs();
}

/**
 * Bỏ bộ lọc slot/loại log và về Tất cả offer.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsClearLogFilters() {
  document.getElementById('stLogSlot').value = '';
  document.getElementById('stLogType').value = '';
  miniStatsSetLogOffer('all');
}

/**
 * Body phạm vi offer cho các API log (rỗng khi chọn Tất cả).
 * @return {object} `{offer}` hoặc `{}`.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsLogScope() {
  return miniStatsState.logOffer !== 'all' ? { offer: miniStatsState.logOffer } : {};
}

/**
 * Mở thư mục HTML log trên máy Mac (theo offer đang chọn).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniStatsOpenLogFolder() {
  const res = await miniStatsPost('/browser-logs/open-folder', miniStatsLogScope());
  showToast(res.error || res.message || 'Đã mở thư mục HTML trong Finder.');
}

/**
 * Xoá log + file HTML (theo offer đang chọn) sau khi người dùng xác nhận.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniStatsClearLogs() {
  const scope = miniStatsLogScope();
  const ok = await miniStatsConfirm(scope.offer
    ? `Xoá toàn bộ log tương tác và file HTML của Offer ${scope.offer}? Không thể hoàn tác.`
    : 'Xoá toàn bộ log tương tác và tất cả file HTML đã lưu? Không thể hoàn tác.');
  if (!ok) return;
  const res = await miniStatsPost('/browser-logs/clear', scope);
  showToast(res.error || res.message || 'Đã xoá log & file HTML.');
  miniStatsState.logSeq = 0; // tải lại đủ để không giữ phiên đã xoá
  await pollLogs();
}

/**
 * Vẽ danh sách hoạt động AI / xác minh lead mới nhất (tối đa 30 dòng) từ log đã tải.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function miniStatsRenderAiActivity() {
  const box = document.getElementById('stAiList');
  if (!box) return;
  const rows = [];
  for (const session of miniStatsState.logs) {
    for (const entry of session.logs || []) {
      const type = String(entry.type || '');
      if (type.startsWith('ai_') || type.startsWith('lead_') || type === 'traffic_blocked') rows.push({ session, entry });
    }
  }
  if (!rows.length) {
    box.innerHTML = '<div style="color:#64748b;">Chưa có hoạt động AI nào được ghi nhận.</div>';
    return;
  }
  rows.sort((a, b) => String(b.entry.time || '').localeCompare(String(a.entry.time || '')));
  box.innerHTML = rows.slice(0, 30).map(({ session, entry }) => `<div>
    <span style="color:#64748b;">${escHtml(entry.time ? new Date(entry.time).toLocaleTimeString('vi-VN') : '--')}</span>
    · Slot ${escHtml(session.slot)} · <b style="color:#c084fc;">${escHtml(miniStatsLogTypes[entry.type] || entry.type)}</b>
    <span style="color:#e2e8f0;">${escHtml(String(entry.detail || entry.url || '').slice(0, 160))}</span>
  </div>`).join('');
}

/**
 * Yêu cầu AI kiểm tra giao diện của slot đang chọn.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniStatsTriggerAi() {
  const slot = Number(document.getElementById('stAiSlot')?.value);
  if (!slot) {
    showToast('Chưa có slot nào đang chạy');
    return;
  }
  const res = await miniStatsPost('/ai/trigger', { slot });
  showToast(res.success ? res.message : (res.error || 'Lỗi khi kích hoạt AI'));
}
