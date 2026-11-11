/**
 * Fetch running state.
 * @return {Promise<void>} Kết quả xử lý fetch running state.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetchRunningState() {
      const state = await api('/state');
      if (!state || state.error) return;

      if (state.leadStats) {
        window.cachedLeadStats = Object.assign(window.cachedLeadStats || {}, state.leadStats);
      }

      const sessions = state.chromeSessions || [];
      window.cachedSessions = sessions;
      _updateScreenSlots(sessions);
      document.getElementById('tabRunCount').textContent = sessions.length;
      document.getElementById('lbTotalRun').textContent = state.limitRun?.count || 0;

      // Cập nhật trạng thái nút Start: làm mờ & vô hiệu hóa khi đang có luồng/offer chạy
      const isRunning = (state.enabled && !state.stopRequested) || sessions.length > 0 || ((state.activeCount || 0) > 0);
      const btnStart = document.getElementById('btnStart');
      if (btnStart) {
        if (isRunning) {
          btnStart.disabled = true;
          if (state.stopRequested) {
            btnStart.textContent = '🛑 Đang dừng...';
          } else {
            btnStart.textContent = `⏳ Đang chạy (${sessions.length} luồng)...`;
          }
        } else {
          btnStart.disabled = false;
          btnStart.textContent = '▶ Start';
        }
      }

      // Update Tab Running Stat Chips
      const totalThreads = sessions.reduce((sum, s) => sum + (s.tabCount || 1), 0);
      const totalLeads = sessions.filter(s => s.leadCheckStatus === 'matched' || s.leadCheckStatus === 'confirmed' || s.leadObserveStatus === 'found').length;
      const totalAi = sessions.reduce((sum, s) => sum + (s.tabs ? s.tabs.filter(t => t.aiRunning).length : (s.aiRunning ? 1 : 0)), 0);
      const elTh = document.getElementById('runStatThreads');
      if (elTh) elTh.textContent = totalThreads;
      const elLd = document.getElementById('runStatLeads');
      if (elLd) elLd.textContent = totalLeads;
      const elAi = document.getElementById('runStatAi');
      if (elAi) elAi.textContent = totalAi;

      // Update Bandwidth Today Chips & Status
      if (state.bandwidth && state.bandwidth.today) {
        window.cachedBandwidthStats = state.bandwidth;
        const todayLabel = bandwidthTodayLabel(state.bandwidth);
        const elBwToday = document.getElementById('runStatBandwidthToday');
        if (elBwToday) elBwToday.textContent = todayLabel;
        const sbBwToday = document.getElementById('sbBandwidthToday');
        if (sbBwToday) sbBwToday.textContent = todayLabel;
      }
      if (state.bandwidth && state.bandwidth.proxy711) {
        update711BalanceDisplay(state.bandwidth.proxy711);
      }

      // Update IP display on top title bar and bottom status bar
      const activeIps = sessions.filter(s => s.exitIp).map(s => `S${s.slot}: ${s.exitIp}`);
      const sbIpsEl = document.getElementById('sbActiveIps');
      if (sbIpsEl) sbIpsEl.textContent = activeIps.length > 0 ? activeIps.join(', ') : '--';
      const appTitleEl = document.querySelector('.win-titlebar-title');
      if (appTitleEl) {
        appTitleEl.textContent = activeIps.length > 0 ? `AutoLeadPC - Cleaned • [${activeIps.join(' | ')}]` : 'AutoLeadPC - Cleaned';
      }
      document.title = activeIps.length > 0 ? `AutoLeadPC • [${activeIps.join(' | ')}]` : 'AutoLeadPC - Cleaned';

      // Đồng bộ thông tin point & lead từ toffers nền
      if (state.toffers && state.toffers.point !== null && state.toffers.point !== undefined) {
        const ptStr = `${state.toffers.point} pt`;
        const elH = document.getElementById('tabLeadPointHeader');
        if (elH && elH.textContent !== ptStr) elH.textContent = ptStr;
        const elLb = document.getElementById('lbToffersPoint');
        if (elLb && elLb.textContent !== String(state.toffers.point)) elLb.textContent = String(state.toffers.point);
        const elSb = document.getElementById('sbToffersPoint');
        if (elSb && elSb.textContent !== String(state.toffers.point)) elSb.textContent = String(state.toffers.point);
        const elRun = document.getElementById('runStatPoint');
        if (elRun && elRun.textContent !== String(state.toffers.point)) elRun.textContent = String(state.toffers.point);
        const elCnt = document.getElementById('lbToffersLeadCount');
        if (elCnt && elCnt.textContent !== String(state.toffers.leadCount)) elCnt.textContent = String(state.toffers.leadCount);
      }

      // Populate manual AI trigger dropdown
      const aiSlotSelect = document.getElementById('cbbAiManualSlot');
      if (aiSlotSelect) {
        const curVal = aiSlotSelect.value;
        if (sessions.length > 0) {
          aiSlotSelect.innerHTML = sessions.map(s => `<option value="${s.slot}"${String(s.slot) === curVal ? ' selected' : ''}>Slot ${s.slot}</option>`).join('');
        } else {
          aiSlotSelect.innerHTML = '<option value="1">Slot 1</option>';
        }
      }

      // Compute counts per running offer
      const runOfferCounts = {};
      const allOfferKeys = new Set(['1']);
      const cfgOffers = getConfiguredOfferMap();
      Object.keys(cfgOffers).forEach(k => allOfferKeys.add(k));

      sessions.forEach(s => {
        const off = String(s.offerNumber || s.streamRole || 1);
        allOfferKeys.add(off);
        runOfferCounts[off] = (runOfferCounts[off] || 0) + 1;
      });

      // Render running offer sub-tabs
      const runTabContainer = document.getElementById('runningOfferTabHeaders');
      if (runTabContainer) {
        const sortedRunOffers = [...allOfferKeys].sort((a, b) => Number(a) - Number(b));
        const tabsHtml = [
          `<div class="run-offer-pill ${currentSelectedRunningOfferTab === 'all' ? 'active' : ''}" data-run-offer="all" onclick="switchRunningOfferTab('all')">🌐 Tất cả luồng <span class="pill-count" id="countRunAll">${sessions.length}</span></div>`,
          ...sortedRunOffers.map(k => {
            const cnt = runOfferCounts[k] || 0;
            return `<div class="run-offer-pill ${currentSelectedRunningOfferTab === k ? 'active' : ''}" data-run-offer="${k}" onclick="switchRunningOfferTab('${k}')">🏷️ Offer ${k} <span class="pill-count">${cnt}</span></div>`;
          })
        ].join('');
        if (runTabContainer.innerHTML !== tabsHtml) {
          runTabContainer.innerHTML = tabsHtml;
        }
      }

      // Filter visible sessions according to sub-tab
      let visibleSessions = sessions;
      if (currentSelectedRunningOfferTab !== 'all') {
        visibleSessions = sessions.filter(s => String(s.offerNumber || s.streamRole || 1) === currentSelectedRunningOfferTab);
      }

      const tbody = document.getElementById('dgvRunningBody');
      if (!tbody) return;

      if (visibleSessions.length === 0) {
        const emptyMsg = currentSelectedRunningOfferTab === 'all'
          ? 'Không có luồng trình duyệt nào đang chạy.'
          : `Không có luồng nào đang chạy cho Offer ${currentSelectedRunningOfferTab}.`;
        tbody._uxRenderKey = null;
        tbody._hasEmptyState = true;
        tbody.innerHTML = `<tr><td class="cell-selector">►</td><td colspan="10"><div class="running-empty-state"><div class="running-empty-icon">💤</div><div class="running-empty-title">${emptyMsg}</div><div class="running-empty-sub">Hãy qua tab <b>Dashboard</b>, kiểm tra danh sách Proxy và bấm nút <b>▶ Start</b> để bắt đầu.</div></div></td></tr>`;
        return;
      }

      if (tbody._hasEmptyState) {
        tbody.innerHTML = '';
        tbody._hasEmptyState = false;
      }

      // Tối ưu DOM diffing theo Slot: tái sử dụng <tr> sẵn có, chỉ cập nhật cell thay đổi.
      // Tuyệt đối không xóa tbody.innerHTML = '' mỗi 1,5s làm trình duyệt giật lag khi mở 15+ luồng.
      const existingRows = new Map();
      const visibleSlotSet = new Set(visibleSessions.map(s => Number(s.slot)));
      const rowsToRemove = [];

      for (const tr of tbody.querySelectorAll('tr[data-slot]')) {
        const slotId = Number(tr.dataset.slot);
        if (!visibleSlotSet.has(slotId)) {
          rowsToRemove.push(tr);
        } else {
          existingRows.set(slotId, tr);
        }
      }
      rowsToRemove.forEach(tr => tr.remove());

      visibleSessions.forEach((s, idx) => {
        const slot = Number(s.slot);
        const screenLabel = `Màn ${s.currentScreen || ((s.completedScreens || 0) + 1)} • ${s.pageJumps || 0} nhảy`;
        const leadBadge = s.leadCheckStatus === 'confirmed' || s.leadCheckStatus === 'matched'
          ? `<span class="run-status-pill status-lead" title="Đã có lead! Đang ở ${screenLabel}">🎯 ${screenLabel}</span>`
          : s.leadCheckStatus === 'checking'
            ? '<span class="run-status-pill status-checking"><span class="spin-dot"></span> Checking</span>'
            : s.leadCheckStatus === 'unmatched'
              ? '<span class="run-status-pill status-checking" title="API có lead nhưng IP chưa khớp; trình duyệt được giữ mở">⚠️ Lead chưa khớp IP</span>'
              : s.leadCheckStatus === 'api_error'
                ? '<span class="run-status-pill status-checking" title="Không xác minh được do lỗi API; trình duyệt được giữ mở">⚠️ Lỗi API lead</span>'
                // Không tick Check Lead: kết quả theo dõi lead sau khi nhập email (chỉ hiển thị).
                : s.leadObserveStatus === 'found'
                  ? `<span class="run-status-pill status-lead" title="${escHtml(s.leadObserveMessage || 'Có lead')}">🎯 Có lead • ${screenLabel}</span>`
                  : s.leadObserveStatus === 'waiting' || s.leadObserveStatus === 'api_error'
                    ? `<span class="run-status-pill status-checking" title="${escHtml(s.leadObserveMessage || 'Đang chờ lead')}">⏳ Chờ lead • ${screenLabel}</span>`
                    : s.leadObserveStatus === 'not_found'
                      ? `<span class="run-status-pill status-idle" title="${escHtml(s.leadObserveMessage || 'Chưa thấy lead')}">— Chưa thấy lead • ${screenLabel}</span>`
                      : `<span class="run-status-pill status-idle" title="Tiến trình hiện tại: ${screenLabel}">${screenLabel}</span>`;

        const actionText = s.aiRunning
          ? `<span class="run-ai-pill">🤖 AI</span> <span class="run-action-text">${escHtml(s.action || 'Đang hỗ trợ điền form')}</span>`
          : `<span class="run-action-text">${escHtml(s.action || s.websiteUrl || 'Running')}</span>`;

        const offerNum = s.offerNumber || s.streamRole || 1;
        const threadBadge = `<span class="run-slot-badge">Slot ${s.slot}</span><span class="badge-log badge-offer" style="font-size:9px;margin-left:4px;">Offer ${offerNum}</span>`;
        const exitIpBadge = `<span class="run-ip-chip" title="Proxy: ${escHtml(s.proxy || 'Direct')}">${escHtml(s.exitIp || 'Direct')}</span>`;
        const emailCell = s.assignedEmail && s.assignedEmail !== '--'
          ? `<span class="run-email-cell" onclick="copyTextToClipboard('${escHtml(s.assignedEmail)}')" title="Nhấp để copy email">${escHtml(s.assignedEmail)}</span>`
          : '<span style="color:#94a3b8;">--</span>';
        const passCell = s.assignedPass ? `<span class="run-pass-chip" title="Mật khẩu">${escHtml(s.assignedPass)}</span>` : '<span style="color:#94a3b8;">--</span>';
        const __deviceIcons = { windows: '🪟', macos: '🍎', linux: '🐧', android: '🤖', ios: '📱', ipad: '📟', iphone: '📱' };
        const __deviceKey = String(s.deviceProfile || '').toLowerCase().replace(/\s+/g, '-');
        const __deviceIcon = __deviceIcons[__deviceKey] ?? '🖥️';
        const __deviceVersion = s.deviceVersion || (s.deviceSummary ? s.deviceSummary.split(' · ')[0] : null) || s.deviceProfile || 'Windows 10';
        const __chromeLabel = /SunBrowser/.test(s.version || '')
          ? (s.version || 'Chrome')
          : `Chrome ${String(s.version || '').replace(/^Chrome\s*/i, '') || s.version}`;
        const deviceInfo = `<span class="run-device-info" title="${escHtml(s.deviceSummary || (__deviceVersion + ' · ' + (s.version || 'Chrome')))}">${__deviceIcon} <strong style="color:#f8fafc;">${escHtml(__deviceVersion)}</strong> · <span style="color:#38bdf8;font-weight:600;">${escHtml(__chromeLabel)}</span></span>`;

        const bwFormatted = s.bandwidthFormatted || '0 B';
        const bwUp = s.bytesSent ? formatBytes(s.bytesSent) : '0 B';
        const bwDown = s.bytesReceived ? formatBytes(s.bytesReceived) : '0 B';
        const bwReqs = s.requestCount || 0;
        const tabsDetail = Array.isArray(s.tabs) && s.tabs.length > 0
          ? s.tabs.map((t, i) => `• Tab ${i + 1}: ${t.bandwidthFormatted || '0 B'} (${t.url ? (t.url.length > 40 ? t.url.slice(0, 40) + '...' : t.url) : 'Trang'})`).join('\n')
          : '';
        const bwTooltip = `Slot ${s.slot} (${s.exitIp || 'Direct'})\nTổng: ${bwFormatted}\n↑ Gửi: ${bwUp}\n↓ Tải: ${bwDown}\nRequests: ${bwReqs}${tabsDetail ? '\n\nChi tiết tab:\n' + tabsDetail : ''}\n\n(Bấm để xem thống kê theo ngày)`;
        const tabBadge = (s.tabCount || 1) > 1 ? `<span style="font-size:9px;background:#1e293b;color:#94a3b8;border:1px solid #334155;padding:1px 4px;border-radius:3px;margin-left:3px;font-weight:600;">${s.tabCount} tabs</span>` : '';

        const bandwidthCell = `
          <div style="cursor:pointer;font-size:11px;" onclick="event.stopPropagation(); openBandwidthModal(${s.slot});" title="${escHtml(bwTooltip)}">
            <span style="font-weight:700;color:#34d399;">📶 ${bwFormatted}</span>${tabBadge}
            <span style="font-size:9.5px;color:#94a3b8;display:block;line-height:1.2;">↑${bwUp} · ↓${bwDown}</span>
          </div>
        `;

        const isWinVis = Boolean(s.isWindowVisible);
        const winBtnLabel = isWinVis ? '🔽 Ẩn' : '🖥️ Hiện';
        const winBtnTitle = isWinVis ? 'Thu nhỏ cửa sổ về chạy ngầm' : 'Bung cửa sổ trình duyệt ra màn hình Desktop';
        const winBtnStyle = isWinVis
          ? 'background:#1e293b;color:#cbd5e1;border:1px solid #334155;'
          : 'background:#0284c7;color:#fff;border:1px solid #0369a1;font-weight:600;';
        const actionButtons = `
          <div style="display:flex;gap:4px;justify-content:center;align-items:center;">
            <button type="button" class="win-btn win-btn-sm" style="padding:1px 6px;font-size:10px;${winBtnStyle}" onclick="event.stopPropagation(); toggleBrowserWindow(${s.slot}, ${isWinVis});" title="${winBtnTitle}">${winBtnLabel}</button>
            <button type="button" class="win-btn win-btn-sm" style="padding:1px 6px;font-size:10px;" onclick="event.stopPropagation(); openScreenModal(${s.slot});" title="Xem trực tiếp trong app">📺 Xem</button>
            <button type="button" class="win-btn win-btn-sm" style="padding:1px 6px;font-size:10px;background:rgba(239,68,68,0.2);color:#fca5a5;border:1px solid rgba(239,68,68,0.4);font-weight:700;" onclick="event.stopPropagation(); closeSingleBrowser(${s.slot});" title="Tắt riêng trình duyệt Slot ${s.slot} (không tự bù slot)">✕</button>
          </div>
        `;

        const selText = idx === 0 ? '►' : '';
        const recText = escHtml(s.assignedRecover || '--');
        const webUrl = escHtml(s.websiteUrl || '');

        let tr = existingRows.get(slot);
        if (!tr) {
          tr = document.createElement('tr');
          tr.dataset.slot = String(slot);
          tr.title = 'Nhấp đúp chuột để bung hoặc thu nhỏ cửa sổ trình duyệt ra Desktop';
          tr.innerHTML = `
            <td class="cell-selector">${selText}</td>
            <td style="text-align:center;white-space:nowrap;">${threadBadge}</td>
            <td style="text-align:center;white-space:nowrap;">${actionButtons}</td>
            <td>${exitIpBadge}</td>
            <td style="white-space:nowrap;">${bandwidthCell}</td>
            <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;" title="${webUrl}">${actionText}</td>
            <td>${leadBadge}</td>
            <td>${deviceInfo}</td>
            <td>${emailCell}</td>
            <td>${passCell}</td>
            <td style="color:#94a3b8;font-size:10.5px;">${recText}</td>
          `;
          tr._cached = {
            selText, threadBadge, isWinVis, exitIpBadge, bandwidthCell, actionText, webUrl, leadBadge, deviceInfo, emailCell, passCell, recText
          };
          tbody.appendChild(tr);
        } else {
          // Tái sử dụng tr: chỉ cập nhật những cell thực sự thay đổi giá trị
          const c = tr._cached || {};
          const tds = tr.children;
          if (c.selText !== selText) { tds[0].textContent = selText; c.selText = selText; }
          if (c.threadBadge !== threadBadge) { tds[1].innerHTML = threadBadge; c.threadBadge = threadBadge; }
          if (c.isWinVis !== isWinVis) { tds[2].innerHTML = actionButtons; c.isWinVis = isWinVis; }
          if (c.exitIpBadge !== exitIpBadge) { tds[3].innerHTML = exitIpBadge; c.exitIpBadge = exitIpBadge; }
          if (c.bandwidthCell !== bandwidthCell) { tds[4].innerHTML = bandwidthCell; c.bandwidthCell = bandwidthCell; }
          if (c.actionText !== actionText || c.webUrl !== webUrl) {
            tds[5].innerHTML = actionText;
            tds[5].title = webUrl;
            c.actionText = actionText;
            c.webUrl = webUrl;
          }
          if (c.leadBadge !== leadBadge) { tds[6].innerHTML = leadBadge; c.leadBadge = leadBadge; }
          if (c.deviceInfo !== deviceInfo) { tds[7].innerHTML = deviceInfo; c.deviceInfo = deviceInfo; }
          if (c.emailCell !== emailCell) { tds[8].innerHTML = emailCell; c.emailCell = emailCell; }
          if (c.passCell !== passCell) { tds[9].innerHTML = passCell; c.passCell = passCell; }
          if (c.recText !== recText) { tds[10].textContent = s.assignedRecover || '--'; c.recText = recText; }
          tr._cached = c;
          tbody.appendChild(tr); // Duy trì thứ tự đúng mà không tạo mới DOM
        }

        tr.ondblclick = () => toggleBrowserWindow(s.slot, isWinVis);
      });
    }
