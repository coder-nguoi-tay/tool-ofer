/**
 * Poll state.
 * @return {Promise<void>} Kết quả xử lý poll state.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function pollState() {
      try {
        const res = await fetch('/state');
        if (!res.ok) return;
        const state = await res.json();

        const running = state.enabled && !state.stopRequested;
        activeSessions = (state.chromeSessions || []).filter((s) => !s.isClosed);
        const isRunning = running || activeSessions.length > 0 || ((state.activeCount || 0) > 0);
        const activeCount = activeSessions.length || state.activeCount || 0;

        // Cập nhật trạng thái nút START (Làm mờ & khóa nút khi đang có offer/luồng chạy)
        const btnStart = document.getElementById('btnStartLaunch');
        if (btnStart) {
          if (isRunning) {
            btnStart.disabled = true;
            if (state.stopRequested) {
              btnStart.textContent = '🛑 ĐANG DỪNG CÁC LUỒNG...';
            } else {
              btnStart.textContent = `⏳ ĐANG CHẠY (${activeCount} luồng)...`;
            }
          } else {
            btnStart.disabled = false;
            btnStart.textContent = '▶ BẮT ĐẦU CHẠY (START)';
          }
        }

        // Header status
        const dot = document.getElementById('topStatusDot');
        dot.className = 'status-dot' + (running ? '' : state.enabled ? ' paused' : ' stopped');
        document.getElementById('topStatusText').textContent = `${state.activeCount || 0}/${state.targetCount || 0} Luồng`;

        // Stats tab
        document.getElementById('statThreads').textContent = `${state.activeCount || 0} / ${state.targetCount || 0}`;
        const leads = state.limitRun?.count || 0;
        const maxLeads = state.limitRun?.max || 0;
        document.getElementById('statLeads').textContent = `${leads}${maxLeads > 0 ? '/' + maxLeads : ''}`;
        document.getElementById('statBw').textContent = state.bandwidth?.today?.formatted || '0 B';

        const totalRuns = state.totalRuns || (state.activeCount + leads) || 1;
        const leadRate = totalRuns > 0 ? Math.round((leads / totalRuns) * 100) : 0;
        document.getElementById('statLeadRate').textContent = `${leadRate}%`;

        // Toffers Points & Leads
        if (state.toffers && (state.toffers.point !== null && state.toffers.point !== undefined)) {
          const pt = state.toffers.point;
          const elTopPt = document.getElementById('topPointVal');
          if (elTopPt) elTopPt.textContent = `${pt} pt`;
          const elBigPt = document.getElementById('statTotalPointBig');
          if (elBigPt) elBigPt.textContent = `${pt} pt`;
          const elLdCnt = document.getElementById('statToffersLeadsCount');
          if (elLdCnt && state.toffers.leadCount !== undefined) elLdCnt.textContent = `${state.toffers.leadCount} leads`;
          const elUp = document.getElementById('textToffersUpdated');
          if (elUp && state.toffers.updatedAt) {
            elUp.textContent = `Cập nhật: ${new Date(state.toffers.updatedAt).toLocaleTimeString('vi-VN')}`;
          }
        }

        // Slot pills
        renderSlotPills();

        // Lưới màn hình tất cả IP
        renderScreenGridCards();

        // Active slots breakdown
        renderActiveSlotsList();

        // Current Slot Info on Screen Tab
        const cur = activeSessions.find((s) => s.slot === currentSlot);
        if (cur) {
          urlDisplay.textContent = cur.websiteUrl || cur.tabs?.[0]?.url || 'Đang mở trang...';
          ipDisplay.textContent = `IP: ${cur.exitIp || 'Local'}`;
          updateSmartAutofillChips();
        } else if (activeSessions.length > 0) {
          currentSlot = activeSessions[0].slot;
          if (screenViewMode === 'single' && !eventSource) {
            startStream(currentSlot);
          }
        } else {
          urlDisplay.textContent = 'Không có slot nào đang chạy';
          ipDisplay.textContent = 'IP: --';
          browserTabsBar.style.display = 'none';
          canvasMsg.style.display = 'flex';
          canvasMsg.innerHTML = '<span>⏸ Không có slot nào đang chạy.<br>Chuyển sang tab <b>🚀 Vận hành</b> để Bắt đầu.</span>';
          if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
          }
          if (eventSource) {
            try { eventSource.close(); } catch {}
            eventSource = null;
          }
          currentSlot = null;
          if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      } catch (e) {}
    }
