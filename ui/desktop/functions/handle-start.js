/**
     * Mở các luồng Google Chrome theo cấu hình trên giao diện.
     * @return {Promise<void>} Hoàn tất khi API khởi chạy trả kết quả.
     * @throws {Error} Khi giao diện không thể gửi yêu cầu mở trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function handleStart() {
      const btnStart = document.getElementById('btnStart');
      if (btnStart && btnStart.disabled) return;
      if (window.cachedSessions && window.cachedSessions.length > 0) {
        showWinAlert('Đang có luồng chạy! Vui lòng dừng các luồng trước khi bắt đầu lại.');
        return;
      }
      if (btnStart) {
        btnStart.disabled = true;
        btnStart.textContent = '⏳ Đang khởi tạo...';
      }
      try {
        const offerUrls = [];
        const raw1 = document.getElementById('txtLinkOffer')?.value.trim() || '';
        const raw2 = document.getElementById('txtLinkOffer2')?.value.trim() || '';
        const raw3 = document.getElementById('txtLinkOffer3')?.value.trim() || '';
        const raw4 = document.getElementById('txtLinkOffer4')?.value.trim() || '';

        if (raw1) {
          for (const line of raw1.split(/[\r\n,;]+/)) {
            const u = line.trim();
            if (u && !offerUrls.includes(u)) offerUrls.push(u);
          }
        }
        if (raw2 && !offerUrls.includes(raw2)) offerUrls.push(raw2);
        if (raw3 && !offerUrls.includes(raw3)) offerUrls.push(raw3);
        if (raw4 && !offerUrls.includes(raw4)) offerUrls.push(raw4);

        const websiteUrl = offerUrls[0] || raw1;
        const websiteUrl2 = offerUrls[1] || raw2;
        const websiteUrl3 = offerUrls[2] || raw3;
        const websiteUrl4 = offerUrls[3] || raw4;
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
        const timeLimit = parseInt(document.getElementById('txtTimeLimit').value) || 0;
        const delayStart = parseInt(document.getElementById('nudDelayStart').value) || 0;
        const delayStop = parseInt(document.getElementById('nudDelayStop').value) || 0;
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
        const enableLeadCheck = document.getElementById('cbxCheckLead') ? document.getElementById('cbxCheckLead').checked : false;
        const autoCloseNoLead = enableLeadCheck; // Khi bật Check Lead (2x30s): không có lead sẽ tự động đóng trình duyệt
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
                timeLimit,
                delayStart,
                delayStop,
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
                autoCloseNoLead,
                leadCheckInterval: 30,
                leadCheckMaxAttempts: 2,
                leadCheckScreen: 4,
                hideUntilTarget,
                hideBrowser: hideUntilTarget,
                hideUntilLead,
                runInApp,
                screenPreviewOnly: runInApp,
                useCloakBrowser: Boolean(document.getElementById('cbxCloakBrowser')?.checked || document.getElementById('chkUseCloakBrowser')?.checked),
                dataSaver,
              }
            })
          });
          document.getElementById('lbStatus').textContent = res.message || 'Sequential mode active.';
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
              timeLimit,
              delayStart,
              delayStop,
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
              autoCloseNoLead,
              leadCheckInterval: 30,
              leadCheckMaxAttempts: 2,
              leadCheckScreen: 4,
              hideUntilTarget,
              hideBrowser: hideUntilTarget,
              hideUntilLead,
              runInApp,
              screenPreviewOnly: runInApp,
              multiTab: document.getElementById('cbxMultiTab') ? document.getElementById('cbxMultiTab').checked : true,
              useCloakBrowser: Boolean(document.getElementById('cbxCloakBrowser')?.checked || document.getElementById('chkUseCloakBrowser')?.checked),
              dataSaver,
            })
          });
          if (res.error) {
            showWinAlert('Lỗi mở trình duyệt: ' + res.error);
            document.getElementById('lbStatus').textContent = 'Launch error: ' + res.error;
          } else if (res.warnings && res.warnings.length > 0 && (!res.results || res.results.length === 0)) {
            showWinAlert('Thông báo: ' + res.warnings.join('\n'));
            document.getElementById('lbStatus').textContent = res.warnings[0];
          } else {
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
