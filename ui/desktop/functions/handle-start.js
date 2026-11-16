/**
 * Mở phiên Chrome hoặc GoLogin theo lựa chọn và lịch chạy trên giao diện.
 * @param {object} options Tùy chọn thực thi lịch hẹn và chỉ số offer được chọn.
 * @return {Promise<void>} Hoàn tất khi API khởi chạy trả kết quả.
 * @throws {Error} Khi giao diện không thể gửi yêu cầu mở trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function handleStart(options = {}) {
      const btnStart = document.getElementById('btnStart');
      if (btnStart && btnStart.disabled) return;
      if (window.cachedSessions && window.cachedSessions.length > 0) {
        showWinAlert('Đang có luồng chạy! Vui lòng dừng các luồng trước khi bắt đầu lại.');
        return;
      }

      // 1. Kiểm tra hẹn giờ: Nếu chưa phải lượt kích hoạt từ timer và có offer hẹn giờ
      const schedules = typeof getOfferScheduleSettings === 'function'
        ? getOfferScheduleSettings().filter(s => s && s.enabled)
        : [];

      if (!options?.executeSchedule && schedules.length > 0) {
        const scheduled = startOfferScheduler(schedules, async scheduledItem => {
          await handleStart({ executeSchedule: true, targetOfferIndex: scheduledItem.offerIndex });
        });
        if (scheduled) return;
      }

      if (btnStart) {
        btnStart.disabled = true;
        btnStart.textContent = '⏳ Đang khởi tạo...';
      }
      try {
        const offerUrls = [];
        const raw1 = document.getElementById('txtLinkOffer')?.value?.trim() || '';
        const raw2 = document.getElementById('txtLinkOffer2')?.value?.trim() || '';
        const raw3 = document.getElementById('txtLinkOffer3')?.value?.trim() || '';
        const raw4 = document.getElementById('txtLinkOffer4')?.value?.trim() || '';

        // Tới giờ hẹn của một offer thì chỉ chạy link của offer đó (Offer 1 nhiều dòng thì chạy mọi dòng của Link 1);
        // trước đây targetOfferIndex bị bỏ qua nên tới giờ hẹn Offer 2 lại chạy cả 4 link.
        const target = options?.executeSchedule ? Number(options.targetOfferIndex) || 0 : 0;
        if (raw1 && (!target || target === 1)) {
          for (const line of raw1.split(/[\r\n,;]+/)) {
            const u = line.trim();
            if (u && !offerUrls.includes(u)) offerUrls.push(u);
          }
        }
        if (raw2 && (!target || target === 2) && !offerUrls.includes(raw2)) offerUrls.push(raw2);
        if (raw3 && (!target || target === 3) && !offerUrls.includes(raw3)) offerUrls.push(raw3);
        if (raw4 && (!target || target === 4) && !offerUrls.includes(raw4)) offerUrls.push(raw4);
        if (target && !offerUrls.length) {
          showWinAlert(`Tới giờ hẹn Offer ${target} nhưng link của offer này đang trống.`);
          return;
        }

        const websiteUrl = offerUrls[0] || (target ? '' : raw1);
        const websiteUrl2 = offerUrls[1] || (target ? '' : raw2);
        const websiteUrl3 = offerUrls[2] || (target ? '' : raw3);
        const websiteUrl4 = offerUrls[3] || (target ? '' : raw4);
        if (!websiteUrl) {
          showWinAlert('Vui lòng nhập Link Offer!');
          return;
        }

        // Tự động lưu các link offer mới điền để không bị mất khi chạy
        const savedOffer = await saveOfferConfig(true);
        if (!savedOffer?.success) {
          showWinAlert('Không lưu được cấu hình offer; đã hủy Start.');
          return;
        }

        const concurrency = Math.min(30, Math.max(1, parseInt(document.getElementById('nudThread').value) || 1));
        const scriptPath = document.getElementById('cbbScript').value;
        // Ô Chờ tối đa (phút): phiên chạy quá thời gian này thì tự tắt và bù slot; 0 = không giới hạn.
        const maxRunMinutes = Math.max(0, parseFloat(document.getElementById('txtTimeLimit').value) || 0);
        const delayStart = parseInt(document.getElementById('nudDelayStart').value) || 0;
        const delayStop = parseInt(document.getElementById('nudDelayStop').value) || 0;
        const enableChoiceDelay = Boolean(document.getElementById('cbxChoiceDelay')?.checked || document.getElementById('cbxChoiceDelayPill')?.checked);
        const choiceDelay = enableChoiceDelay ? (parseInt(document.getElementById('nudChoiceDelay')?.value, 10) || 2) : 0;
        const completeText = document.getElementById('txtTextComplete').value.trim();
        const limitRun = parseInt(document.getElementById('nudLimitRun').value) || 0;
        const mode = document.getElementById('cbxAuto').value;

        const antiFpCanvas = document.getElementById('CheckBoxCanvas').checked;
        const antiFpClientRects = document.getElementById('CheckboxClientRects').checked;
        const antiFpWebgl = document.getElementById('CheckBoxWebGLImage').checked;
        const antiFpWebrtc = document.getElementById('CheckBoxWebRTC').checked;
        const antiFpFonts = document.getElementById('CheckboxFonts').checked;
        const antiFpApiFakeIP = document.getElementById('CheckBoxGetApiPake').checked;

        const proxyLines = document.getElementById('txtDashboardProxy').value.trim();
        const proxyType = document.getElementById('dashboardProxyType')?.value || 'socks5';
        if (proxyLines) {
          await api('/proxy-queue/import', {
            method: 'POST',
            body: JSON.stringify({ proxyList: proxyLines, proxyType })
          });
        }

        const checkDuplicate = document.getElementById('cbxCheckDuplicateIP') ? document.getElementById('cbxCheckDuplicateIP').checked : true;
        const dataSaver = document.getElementById('cbxDataSaver') ? document.getElementById('cbxDataSaver').checked : true;
        const { enableLeadCheck, leadCheckInterval, stopAutofillOnLead } = getLeadCheckSettings();
        const autoCloseNoLead = enableLeadCheck;
        const hideUntilTarget = Boolean(document.getElementById('cbxHideUntilTarget')?.checked);
        const hideUntilLead = Boolean(document.getElementById('cbxHideUntilLead')?.checked);
        // "Chạy trong app": đọc trạng thái checkbox thật (bật = chạy ngầm thu nhỏ, tắt = mở cửa sổ Desktop thường)
        const runInApp = Boolean(document.getElementById('cbxRunInApp')?.checked);

        document.getElementById('lbStatus').textContent = 'Starting Chrome...';
        if (hideUntilTarget || hideUntilLead) {
          switchTab('ScreenView');
        } else {
          switchTab('tabRunning');
        }
        fetchRunningState();

        const streamCount = Math.max(concurrency, offerUrls.length >= 2 ? offerUrls.length : 1);

        if (mode === 'sequential') {
          const res = await api('/auto-refill/sequential', {
            method: 'POST',
            body: JSON.stringify({
              enabled: true,
              settings: {
                websiteUrl,
                websiteUrl2,
                websiteUrl3,
                websiteUrl4,
                offerUrls,
                offerList: offerUrls,
                concurrency: streamCount,
                requestedCount: streamCount,
                proxyList: proxyLines,
                proxyType,
                scriptPath,
                maxRunMinutes,
                delayStart,
                delayStop,
                choiceDelay,
                enableChoiceDelay,
                completeText,
                limitRun,
                antiFpCanvas,
                antiFpClientRects,
                antiFpWebgl,
                antiFpWebrtc,
                antiFpFonts,
                antiFpApiFakeIP,
                Windows: document.getElementById('chkWindows')?.checked ?? false,
                Mac: document.getElementById('chkMac')?.checked ?? false,
                Linux: document.getElementById('chkLinux')?.checked ?? false,
                Android: document.getElementById('chkAndroid')?.checked ?? false,
                iPhone: document.getElementById('chkIphone')?.checked ?? false,
                iPad: document.getElementById('chkIpad')?.checked ?? false,
                checkDuplicate,
                autoSubmitForm: true,
                enableLeadCheck,
                stopAutofillOnLead,
                autoCloseNoLead,
                leadCheckInterval,
                leadCheckMaxAttempts: 2,
                leadCheckScreen: 4,
                hideUntilTarget,
                hideBrowser: hideUntilTarget,
                hideUntilLead,
                runInApp,
                screenPreviewOnly: runInApp,
                useGoLogin: Boolean(document.getElementById('cbxGoLogin')?.checked),
                gologinDevices: document.getElementById('cbxGoLogin')?.checked && typeof getGoLoginDeviceChoices === 'function' ? getGoLoginDeviceChoices() : undefined,
                browserMode: Boolean(document.getElementById('cbxGoLogin')?.checked) ? 'GoLogin' : 'Chrome',
                dataSaver,
                offerSolver: document.getElementById('cbbOfferSolver')?.value || 'auto',
                scheduleStop: typeof getScheduleStopSettings === 'function' ? getScheduleStopSettings() : null,
              }
            })
          });
          document.getElementById('lbStatus').textContent = res.message || 'Sequential mode active.';
          if (typeof syncStopSchedulerState === 'function') syncStopSchedulerState();
        } else {
          const res = await api('/launch', {
            method: 'POST',
            body: JSON.stringify({
              websiteUrl,
              websiteUrl2,
              websiteUrl3,
              websiteUrl4,
              offerUrls,
              offerList: offerUrls,
              requestedCount: concurrency,
              concurrency,
              proxyList: proxyLines,
              proxyType,
              scriptPath,
              maxRunMinutes,
              delayStart,
              delayStop,
              choiceDelay,
              enableChoiceDelay,
              completeText,
              limitRun,
              antiFpCanvas,
              antiFpClientRects,
              antiFpWebgl,
              antiFpWebrtc,
              antiFpFonts,
              antiFpApiFakeIP,
              Windows: document.getElementById('chkWindows')?.checked ?? false,
              Mac: document.getElementById('chkMac')?.checked ?? false,
              Linux: document.getElementById('chkLinux')?.checked ?? false,
              Android: document.getElementById('chkAndroid')?.checked ?? false,
              iPhone: document.getElementById('chkIphone')?.checked ?? false,
              iPad: document.getElementById('chkIpad')?.checked ?? false,
              checkDuplicate,
              autoSubmitForm: true,
              enableLeadCheck,
              stopAutofillOnLead,
              autoCloseNoLead,
              leadCheckInterval,
              leadCheckMaxAttempts: 2,
              leadCheckScreen: 4,
              hideUntilTarget,
              hideBrowser: hideUntilTarget,
              hideUntilLead,
              runInApp,
              screenPreviewOnly: runInApp,
              runMode: mode,
              multiTab: document.getElementById('cbxMultiTab') ? document.getElementById('cbxMultiTab').checked : true,
              useGoLogin: Boolean(document.getElementById('cbxGoLogin')?.checked),
                gologinDevices: document.getElementById('cbxGoLogin')?.checked && typeof getGoLoginDeviceChoices === 'function' ? getGoLoginDeviceChoices() : undefined,
              browserMode: Boolean(document.getElementById('cbxGoLogin')?.checked) ? 'GoLogin' : 'Chrome',
              dataSaver,
              offerSolver: document.getElementById('cbbOfferSolver')?.value || 'auto',
              scheduleStop: typeof getScheduleStopSettings === 'function' ? getScheduleStopSettings() : null,
            })
          });
          if (res.error) {
            showWinAlert('Lỗi mở trình duyệt: ' + res.error);
            document.getElementById('lbStatus').textContent = 'Launch error: ' + res.error;
          } else if (res.warnings && res.warnings.length > 0 && (!res.results || res.results.length === 0)) {
            showWinAlert('Thông báo: ' + res.warnings.join('\n'));
            document.getElementById('lbStatus').textContent = res.warnings[0];
          } else {
            if (typeof syncStopSchedulerState === 'function') syncStopSchedulerState();
            document.getElementById('lbStatus').textContent = res.message || 'Chrome launched successfully.';
          }
          fetchRunningState();
        }
      } catch (err) {
        showWinAlert('Lỗi mở trình duyệt: ' + (err?.message || err));
        document.getElementById('lbStatus').textContent = 'Launch error: ' + (err?.message || err);
      } finally {
        fetchRunningState();
      }
    }
