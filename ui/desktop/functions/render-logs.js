/**
 * Render logs.
 * @return {void} Kết quả xử lý render logs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderLogs() {
      const slotFilterEl = document.getElementById('logFilterSlot');
      const typeFilterEl = document.getElementById('logFilterType');
      if (!slotFilterEl || !typeFilterEl) return;

      const slotFilter = slotFilterEl.value;
      const typeFilter = typeFilterEl.value;

      // Extract all slots and offer stats
      const slots = new Set(logData.map((s) => String(s.slot)));
      const logOfferCounts = {};
      const logOfferLeads = {};
      const logOfferBlocked = {};
      const logOfferAi = {};
      let totalAllEntries = 0;
      let totalAllLeads = 0;
      let totalAllBlocked = 0;
      let totalAllAi = 0;

      const allOfferKeys = new Set(['1']);
      const cfgOffers = getConfiguredOfferMap();
      Object.keys(cfgOffers).forEach(k => allOfferKeys.add(k));

      for (const session of logData) {
        const sessOffer = String(session.offer || 1);
        allOfferKeys.add(sessOffer);

        for (const entry of session.logs || []) {
          const off = String(entry.offer ?? sessOffer);
          allOfferKeys.add(off);
          logOfferCounts[off] = (logOfferCounts[off] || 0) + 1;
          totalAllEntries++;

          if (entry.type === 'lead_confirmed') {
            logOfferLeads[off] = (logOfferLeads[off] || 0) + 1;
            totalAllLeads++;
          } else if (entry.type === 'traffic_blocked' || entry.type === 'ai_error') {
            logOfferBlocked[off] = (logOfferBlocked[off] || 0) + 1;
            totalAllBlocked++;
          }
          if (entry.type && (entry.type.startsWith('ai_') || entry.type === 'ai_action')) {
            logOfferAi[off] = (logOfferAi[off] || 0) + 1;
            totalAllAi++;
          }
        }
      }

      // Populate slot filter dropdown
      const curSlot = slotFilterEl.value;
      slotFilterEl.innerHTML = '<option value="">Tất cả slot</option>'
        + [...slots].sort((a, b) => Number(a) - Number(b)).map((s) => `<option value="${s}"${s === curSlot ? ' selected' : ''}>Slot ${s}</option>`).join('');

      // Render Offer Sub-Tabs for Logs
      const offerTabContainer = document.getElementById('offerLogTabHeaders');
      if (offerTabContainer) {
        const sortedLogOffers = [...allOfferKeys].sort((a, b) => Number(a) - Number(b));
        const tabsHtml = [
          `<div class="win-tab ${currentSelectedOfferLogTab === 'all' ? 'active' : ''}" data-offer-tab="all" onclick="switchOfferLogTab('all')">🌐 Tất cả Offer (<span id="tabLogAllCount">${totalAllEntries}</span>)</div>`,
          ...sortedLogOffers.map(k => {
            const cnt = logOfferCounts[k] || 0;
            return `<div class="win-tab ${currentSelectedOfferLogTab === k ? 'active' : ''}" data-offer-tab="${k}" onclick="switchOfferLogTab('${k}')">🏷️ Offer ${k} (<span>${cnt}</span>)</div>`;
          })
        ].join('');
        if (offerTabContainer.innerHTML !== tabsHtml) {
          offerTabContainer.innerHTML = tabsHtml;
        }
      }

      // Update Offer KPI Bar
      const isAll = currentSelectedOfferLogTab === 'all';
      const kpiTitleEl = document.getElementById('kpiOfferTitle');
      const kpiRunsEl = document.getElementById('kpiTotalRuns');
      const kpiLeadsEl = document.getElementById('kpiLeadCount');
      const kpiBlockedEl = document.getElementById('kpiBlockedCount');
      const kpiAiEl = document.getElementById('kpiAiCount');
      const kpiUrlEl = document.getElementById('kpiOfferUrl');

      if (kpiTitleEl) kpiTitleEl.textContent = isAll ? '🌐 Tất cả Offer' : `🏷️ Offer ${currentSelectedOfferLogTab}`;
      if (kpiRunsEl) {
        if (isAll) {
          kpiRunsEl.textContent = logData.length;
        } else {
          const matchingSessions = logData.filter(s => String(s.offer || 1) === currentSelectedOfferLogTab || (s.logs && s.logs.some(e => String(e.offer || 1) === currentSelectedOfferLogTab)));
          kpiRunsEl.textContent = matchingSessions.length;
        }
      }
      if (kpiLeadsEl) kpiLeadsEl.textContent = isAll ? totalAllLeads : (logOfferLeads[currentSelectedOfferLogTab] || 0);
      if (kpiBlockedEl) kpiBlockedEl.textContent = isAll ? totalAllBlocked : (logOfferBlocked[currentSelectedOfferLogTab] || 0);
      if (kpiAiEl) kpiAiEl.textContent = isAll ? totalAllAi : (logOfferAi[currentSelectedOfferLogTab] || 0);
      if (kpiUrlEl) {
        let offerUrl = '';
        if (isAll) {
          offerUrl = cfgOffers['1'] ? `Offer 1: ${cfgOffers['1']}` : '';
        } else {
          offerUrl = cfgOffers[currentSelectedOfferLogTab] || '';
          if (!offerUrl) {
            for (const s of logData) {
              if (String(s.offer || 1) === currentSelectedOfferLogTab) {
                const nav = s.logs?.find(e => e.type === 'navigate' && e.url);
                if (nav) { offerUrl = nav.url; break; }
              }
            }
          }
        }
        kpiUrlEl.textContent = offerUrl ? `🔗 ${offerUrl}` : '';
        kpiUrlEl.title = offerUrl || '';
      }

      // Update button labels
      const offerLabel = isAll ? '' : ` (Offer ${currentSelectedOfferLogTab})`;
      const btnExport = document.getElementById('btnExportLogCsv');
      const btnOpenFolder = document.getElementById('btnOpenHtmlFolder');
      const btnClear = document.getElementById('btnClearLogsBtn');
      if (btnExport) btnExport.textContent = isAll ? 'Export CSV' : `Export CSV${offerLabel}`;
      if (btnOpenFolder) btnOpenFolder.textContent = isAll ? 'Open HTML Folder' : `Open Folder${offerLabel}`;
      if (btnClear) btnClear.textContent = isAll ? 'Clear Logs' : `Clear Logs${offerLabel}`;

      const confirmTextEl = document.getElementById('logClearConfirmText');
      if (confirmTextEl) {
        confirmTextEl.textContent = isAll
          ? '⚠️ Bạn có chắc muốn xoá toàn bộ log tương tác và tất cả các file HTML đã lưu? Không thể hoàn tác.'
          : `⚠️ Bạn có chắc muốn xoá toàn bộ log tương tác và file HTML của Offer ${currentSelectedOfferLogTab}? Không thể hoàn tác.`;
      }

      // Filter rows
      const rows = [];
      for (const session of logData) {
        if (slotFilter && String(session.slot) !== slotFilter) continue;
        const sessOffer = String(session.offer || 1);
        for (const entry of [...session.logs].reverse()) {
          const entryOffer = String(entry.offer ?? sessOffer);
          if (!isAll && entryOffer !== currentSelectedOfferLogTab) continue;
          if (typeFilter && entry.type !== typeFilter) continue;
          rows.push({ session, entry });
        }
      }

      const badgeEl = document.getElementById('tabLogCount');
      if (badgeEl) badgeEl.textContent = rows.length;
      const subBadgeEl = document.getElementById('tabLogCountSub');
      if (subBadgeEl) subBadgeEl.textContent = rows.length;

      const tbody = document.getElementById('dgvLogsBody');
      if (!tbody) return;

      if (rows.length === 0) {
        const emptyMsg = isAll
          ? 'Chưa có log thao tác trình duyệt. Mở trình duyệt để bắt đầu ghi.'
          : `Chưa có log thao tác cho Offer ${currentSelectedOfferLogTab}.`;
        tbody.innerHTML = `<tr><td class="cell-selector">►</td><td colspan="6" style="text-align:center;color:#888888;padding:30px;">${emptyMsg}</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map(({ session, entry }, idx) => {
        let typeBadge = '<span class="badge-log badge-click">🖱 click</span>';
        let detail = `${escHtml(entry.tag ?? '')} ${escHtml(entry.text ?? '')}`.trim();
        const hasHtml = Boolean(entry.html);

        if (entry.type === 'navigate') {
          typeBadge = '<span class="badge-log badge-navigate">🔗 Điều hướng</span>';
          detail = escHtml(entry.url || '');
        } else if (entry.type === 'submit_clicked') {
          typeBadge = '<span class="badge-log badge-submit">🚀 Submit</span>';
          detail = `<strong style="color:#15803d;">${escHtml(entry.text || 'Submit')}</strong> ${entry.tag ? `&lt;${escHtml(entry.tag)}&gt;` : ''} ${entry.id ? `#${escHtml(entry.id)}` : ''}`.trim();
        } else if (entry.type === 'checkbox_checked') {
          typeBadge = '<span class="badge-log badge-checkbox">☑️ Checkbox</span>';
          detail = `Đã tích ô điều khoản: <strong style="color:#1d4ed8;">${escHtml(entry.id || entry.name || 'consent')}</strong> (${escHtml(entry.text || '')})`;
        } else if (entry.type === 'field_filled') {
          typeBadge = '<span class="badge-log badge-field">✍️ Điền ô</span>';
          detail = `[${escHtml(entry.id || entry.name || '')}] = <strong>${escHtml(entry.text || entry.value || '')}</strong>`;
        } else if (entry.type === 'traffic_blocked') {
          typeBadge = '<span class="badge-log badge-blocked">🚫 Bị chặn</span>';
          detail = `<span style="color:#f87171;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'lead_confirmed') {
          typeBadge = '<span class="badge-log badge-lead">✅ Có lead</span>';
          detail = `<span style="color:#34d399;font-weight:600;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'lead_ip_mismatch') {
          typeBadge = '<span class="badge-log badge-ai-error">⚠️ Lead chưa khớp IP</span>';
          detail = `<span style="color:#fbbf24;font-weight:600;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'lead_check_error') {
          typeBadge = '<span class="badge-log badge-ai-error">⚠️ Lỗi kiểm tra lead</span>';
          detail = `<span style="color:#f87171;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'lead_failed') {
          typeBadge = '<span class="badge-log badge-blocked">❌ Không có lead</span>';
          detail = `<span style="color:#f87171;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_started') {
          typeBadge = '<span class="badge-log badge-ai">🤖 AI phân tích</span>';
          detail = `<span style="color:#c084fc;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_waiting_codex') {
          typeBadge = '<span class="badge-log badge-ai">🤖 AI chờ CLI</span>';
          detail = `<span style="color:#a855f7;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_codex_reply') {
          typeBadge = '<span class="badge-log badge-ai">🤖 AI phản hồi</span>';
          detail = `<span style="color:#34d399;font-weight:bold;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_action') {
          typeBadge = '<span class="badge-log badge-ai-action">🤖 AI thực thi</span>';
          detail = `<span style="color:#818cf8;font-weight:600;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_smart_fallback') {
          typeBadge = '<span class="badge-log badge-ai">🛡️ Fallback</span>';
          detail = `<span style="color:#fbbf24;font-weight:600;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_completed') {
          typeBadge = '<span class="badge-log badge-ai-completed">🤖 AI xong</span>';
          detail = `<span style="color:#38bdf8;font-weight:bold;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_error') {
          typeBadge = '<span class="badge-log badge-ai-error">⚠️ AI lỗi</span>';
          detail = `<span style="color:#f87171;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'ai_sync_scan') {
          typeBadge = '<span class="badge-log badge-ai">🔄 AI Sync</span>';
          detail = `<span style="color:#818cf8;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.type === 'adtrapper_reload') {
          typeBadge = '<span class="badge-log" style="background:rgba(245,158,11,0.2);color:#fbbf24;">🔄 Tải lại</span>';
          detail = `<span style="color:#fbbf24;">${escHtml(entry.detail || '')}</span>`;
        } else if (entry.detail) {
          detail = escHtml(entry.detail);
        }

        const fileTag = entry.htmlFilename
          ? ` <span style="display:inline-block;margin-left:4px;font-size:10px;color:#38bdf8;background:rgba(2,132,199,0.2);padding:1px 5px;border-radius:3px;border:1px solid rgba(56,189,248,0.3);font-family:Consolas,Menlo,monospace;" title="${escHtml(entry.htmlPath || '')}">📄 ${escHtml(entry.htmlFilename)}</span>`
          : '';

        const viewHtmlBtn = hasHtml
          ? ` <button type="button" class="win-btn" style="padding:1px 6px;margin-left:6px;font-size:10px;" onclick="event.stopPropagation();openLogHtmlModal(${idx})">Xem HTML</button>`
          : '';

        const offerNum = entry.offer ?? session.offer ?? 1;
        const offerBadge = `<span class="badge-log badge-offer">Offer ${offerNum}</span>`;

        return `<tr onclick="if(${hasHtml})openLogHtmlModal(${idx})">
          <td class="cell-selector">${idx === 0 ? '►' : ''}</td>
          <td>${fmtTime(entry.time)}</td>
          <td>${offerBadge}</td>
          <td>Slot ${session.slot} · <b>${escHtml(session.ip || '?')}</b></td>
          <td>${typeBadge}</td>
          <td>${detail}${fileTag}${viewHtmlBtn}</td>
        </tr>`;
      }).join('');

      window.__currentLogRows = rows;
    }
