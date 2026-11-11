/**
     * Cập nhật trạng thái tự bù và IP của từng cửa sổ Chrome đang mở.
     * @param {object} state Trạng thái nhận từ máy chủ local.
     * @return {void} Không trả về giá trị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderAutoRefillState(state) {
      autoRefillEnabled = state.enabled;
      autoRefillButton.textContent = `Tự bù: Đang ${autoRefillEnabled ? 'bật' : 'tắt'}`;
      autoRefillButton.setAttribute('aria-pressed', String(autoRefillEnabled));
      if (state.limitRun) {
        const lrCount = state.limitRun.count ?? 0;
        const lrMax   = state.limitRun.max   ?? 0;
        document.getElementById('lr-count').textContent = lrCount;
        document.getElementById('lr-max').textContent   = lrMax > 0 ? lrMax : '0 (không giới hạn)';
        document.getElementById('lr-max').style.color   = lrMax > 0 && lrCount >= lrMax ? '#dc2626' : '#768197';
      }
      // Sequential mode buttons
      const seqRunning = state.sequential;
      document.querySelector('#sequential-start-btn').style.display = seqRunning ? 'none' : '';
      document.querySelector('#sequential-stop-btn').style.display = seqRunning ? '' : 'none';
      const slotSummary = state.targetCount > 0 ? ` (${state.activeCount}/${state.targetCount} trình duyệt)` : '';
      autoRefillStatus.textContent = `${state.message}${slotSummary}`;
      if (!state.chromeSessions?.length) {
        chromeIpStatus.innerHTML = '<p class="hint" style="margin: 0;">Chưa có cửa sổ Chrome đang mở.</p>';
        return;
      }

      const chromeIconSvg = `
        <svg viewBox="0 0 48 48" width="24" height="24" aria-hidden="true">
          <path fill="#4CAF50" d="M44,24c0,11-9,20-20,20c-5,0-9.6-1.8-13.1-4.9l8.6-14.8C20.4,25.4,22.1,26,24,26c3.3,0,6-2.7,6-6 c0-0.7-0.1-1.3-0.3-2h14.1C43.9,20,44,22,44,24z"/>
          <path fill="#FFC107" d="M10.9,39.1C6.7,35.4,4,30,4,24c0-8.8,5.7-16.3,13.7-18.9l8.6,14.8C25.4,20.4,24.8,22.1,24.8,24 c0,2.1,0.8,4,2.2,5.4L10.9,39.1z"/>
          <path fill="#F44336" d="M24,4c8.8,0,16.3,5.7,18.9,13.7H25.7C24.6,17.2,23.3,17,22,17c-3.3,0-6,2.7-6,6 c0,0.7,0.1,1.3,0.3,2L7.7,10.2C11.4,6.4,17.4,4,24,4z"/>
          <circle cx="24" cy="24" r="8" fill="#FFFFFF"/>
          <circle cx="24" cy="24" r="6" fill="#1976D2"/>
        </svg>
      `;

      chromeIpStatus.innerHTML = `
        <div class="chrome-sessions-header">
          <span>🌐 Trình duyệt Chrome đang mở (${state.chromeSessions.length})</span>
          <span style="font-size: 11px; font-weight: normal; color: #66748a;">Hover vào biểu tượng Chrome để xem IP</span>
        </div>
        <div class="chrome-sessions-grid">
          ${state.chromeSessions.map((session) => {
            let leadTag = '';
            if (session.leadCheckStatus === 'waiting') {
              leadTag = '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#fef3c7;color:#92400e;">⏳ Đang chờ lead (30s)...</span>';
            } else if (session.leadCheckStatus === 'confirmed') {
              leadTag = '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#dcfce7;color:#166534;">✅ Có lead về</span>';
            } else if (session.leadCheckStatus === 'api_error') {
              leadTag = `<span style="display:inline-flex;align-items:center;gap:4px;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#fee2e2;color:#991b1b;" title="${session.leadCheckMessage || 'Lỗi API lead'}">⚠️ Lỗi API lead <button type="button" class="resume-lead-btn" data-slot="${session.slot}" style="background:#dc2626;color:#fff;border:none;border-radius:3px;padding:1px 5px;font-size:9px;cursor:pointer;">Tiếp tục fill</button></span>`;
            } else if (session.leadCheckStatus === 'failed') {
              leadTag = '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#fee2e2;color:#991b1b;">❌ Không lead (đang đổi)</span>';
            } else if (session.leadObserveStatus === 'found') {
              leadTag = '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#dcfce7;color:#166534;">✅ Có lead về</span>';
            } else if (session.leadObserveStatus === 'waiting' || session.leadObserveStatus === 'api_error') {
              leadTag = '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#fef3c7;color:#92400e;">⏳ Đang chờ lead</span>';
            } else if (session.leadObserveStatus === 'not_found') {
              leadTag = '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#f1f5f9;color:#475569;">— Chưa thấy lead</span>';
            }

            let aiTag = '';
            if (session.aiRunning) {
              aiTag = '<span style="display:inline-flex;align-items:center;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;background:#f3e8ff;color:#6b21a8;">🤖 AI Assist</span>';
            }

            const extra = [
              session.autofillRecord ? `Lead #${session.autofillRecord} (${session.autofillFields} trường)` : '',
              session.assignedEmail ? `📧 ${session.assignedEmail}` : '',
              session.autofillError ? `Lỗi: ${session.autofillError}` : '',
              session.leadCheckMessage ? session.leadCheckMessage : '',
              session.extensions && !session.extensions.startsWith('không có') ? `Ext: ${session.extensions}` : '',
            ].filter(Boolean).join(' · ');

            const deviceIcons = { windows:'🪟', macos:'🍎', linux:'🐧', android:'🤖', ipad:'📟', ios:'📱' };
            const deviceLabels = { windows:'Windows', macos:'macOS', linux:'Linux', android:'Android', ipad:'iPad', ios:'iPhone' };
            const deviceIcon = deviceIcons[session.deviceProfile] ?? '🖥';
            const deviceLabel = deviceLabels[session.deviceProfile] ?? session.deviceProfile ?? 'Desktop';
            const tooltipText = `IP Exit: ${session.exitIp}\nCửa sổ ${session.slot} (Chrome ${session.version})\nThiết bị: ${session.deviceSummary || deviceLabel}\nProxy: ${session.proxy || 'Trực tiếp'}${session.assignedEmail ? '\nEmail: ' + session.assignedEmail : ''}${session.leadCheckMessage ? '\n' + session.leadCheckMessage : ''}`;

            return `
              <div class="chrome-session-card">
                <div class="chrome-icon-badge" title="${tooltipText}">
                  ${chromeIconSvg}
                  <div class="chrome-hover-tooltip">
                    <strong style="color: #70DFFF;">IP: ${session.exitIp}</strong><br>
                    <span>Cửa sổ ${session.slot} · Chrome ${session.version}</span><br>
                    <span style="color: #94a3b8; font-size: 10px;">${session.proxy || 'Trực tiếp'}</span>
                    ${session.leadCheckMessage ? `<br><span style="color:#fbbf24;font-size:10px;">${session.leadCheckMessage}</span>` : ''}
                  </div>
                </div>
                <div class="chrome-card-details">
                  <div class="chrome-card-top">
                    <span class="chrome-card-slot">Cửa sổ ${session.slot}</span>
                    <span class="chrome-card-version">v${session.version}</span>
                    <span style="font-size:11px;margin-left:4px;" title="${session.deviceSummary || deviceLabel}">${deviceIcon} <strong style="font-size:11px;color:#0f172a;">${session.deviceVersion || (session.deviceSummary ? session.deviceSummary.split(' · ')[0] : deviceLabel)}</strong></span>
                    ${session.streamLabel ? `<span style="background:${session.streamRole === 2 ? '#8b5cf6' : '#2563eb'};color:#fff;font-size:10px;font-weight:600;padding:1px 6px;border-radius:4px;margin-left:auto;">${session.streamLabel}</span>` : ''}
                  </div>
                  <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                    <div class="chrome-card-ip" title="IP Exit: ${session.exitIp}">
                      <span>🌐</span> ${session.exitIp}
                    </div>
                    ${leadTag}
                    ${aiTag}
                  </div>
                  ${session.websiteUrl ? `<div style="font-size:10px;color:#64748b;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${session.websiteUrl}">🔗 ${session.websiteUrl}</div>` : ''}
                  ${extra ? `<div class="chrome-card-extra" title="${extra}">${extra}</div>` : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }
