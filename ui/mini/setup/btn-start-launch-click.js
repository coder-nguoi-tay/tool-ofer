// Đồng bộ class .active cho các option pills khi checkbox thay đổi

    // Đọc cấu hình gần nhất

    // Nút BẮT ĐẦU CHẠY (START)
    document.getElementById('btnStartLaunch').addEventListener('click', async () => {
      const btnStart = document.getElementById('btnStartLaunch');
      if (btnStart && (btnStart.disabled || (activeSessions && activeSessions.length > 0))) {
        showToast('⚠️ Đang có luồng chạy! Vui lòng dừng luồng trước khi bắt đầu lại.', 'warning');
        return;
      }

      const websiteUrl = document.getElementById('inputWebsiteUrl').value.trim();
      if (!websiteUrl) {
        alert('Vui lòng nhập Link Offer / Website!');
        return;
      }
      const websiteUrl2 = document.getElementById('inputWebsiteUrl2').value.trim();
      const websiteUrl3 = document.getElementById('inputWebsiteUrl3').value.trim();
      const websiteUrl4 = document.getElementById('inputWebsiteUrl4').value.trim();

      const offerUrls = [websiteUrl];
      if (websiteUrl2) offerUrls.push(websiteUrl2);
      if (websiteUrl3) offerUrls.push(websiteUrl3);
      if (websiteUrl4) offerUrls.push(websiteUrl4);

      const concurrency = parseInt(inputThreadCount.value, 10) || 1;
      const limitRun = parseInt(document.getElementById('inputLimitRun').value, 10) || 0;
      const timeLimit = parseInt(document.getElementById('inputTimeLimit').value, 10) || 30;
      const delayStart = parseInt(document.getElementById('inputDelayStart').value, 10) || 1;
      const delayStop = parseInt(document.getElementById('inputDelayStop').value, 10) || 1;
      const completeText = document.getElementById('inputCompleteText').value.trim();

      const runInApp = document.getElementById('cbxRunInApp').checked;
      const multiTab = document.getElementById('cbxMultiTab').checked;
      const useCloakBrowser = document.getElementById('cbxCloakBrowser').checked;
      const dataSaver = document.getElementById('cbxDataSaver').checked;
      const checkDuplicate = document.getElementById('cbxCheckDuplicateIP').checked;
      const hideUntilTarget = document.getElementById('cbxHideUntilTarget').checked;
      const hideUntilLead = document.getElementById('cbxHideUntilLead').checked;
      const enableLeadCheck = document.getElementById('cbxCheckLead').checked;
      const aiAssist = document.getElementById('cbxAiAssist').checked;
      const saveRRS = document.getElementById('cbxRRS').checked;
      const autoSubmitForm = document.getElementById('cbxAutoSubmit').checked;

      const Windows = document.getElementById('chkWindows').checked;
      const Mac = document.getElementById('chkMac').checked;
      const Linux = document.getElementById('chkLinux').checked;
      const Android = document.getElementById('chkAndroid').checked;
      const iPhone = document.getElementById('chkIphone').checked;
      const iPad = document.getElementById('chkIpad').checked;

      // Khóa và làm mờ nút Start ngay khi bắt đầu bấm
      if (btnStart) {
        btnStart.disabled = true;
        btnStart.textContent = '⏳ ĐANG KHỞI CHẠY...';
      }

      showToast(`Đang khởi động ${concurrency} luồng (${currentBrowserMode})...`);
      try {
        const res = await fetch('/launch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            browserMode: currentBrowserMode,
            useAdsPower: currentBrowserMode === 'AdsPower',
            websiteUrl,
            websiteUrl2,
            websiteUrl3,
            websiteUrl4,
            offerUrls,
            offerList: offerUrls,
            requestedCount: concurrency,
            concurrency,
            limitRun,
            timeLimit,
            delayStart,
            delayStop,
            completeText,
            autoSubmitForm,
            checkDuplicate,
            dataSaver,
            runInApp,
            screenPreviewOnly: runInApp,
            multiTab,
            useCloakBrowser,
            hideUntilTarget,
            hideBrowser: hideUntilTarget,
            hideUntilLead,
            enableLeadCheck,
            autoCloseNoLead: enableLeadCheck,
            leadCheckInterval: 30,
            leadCheckMaxAttempts: 2,
            leadCheckScreen: 4,
            aiAssist,
            saveRRS,
            Windows,
            Mac,
            Linux,
            Android,
            iPhone,
            iPad,
            antiFpCanvas: true,
            antiFpClientRects: true,
            antiFpWebgl: true,
            antiFpFonts: true,
            antiFpApiFakeIP: true,
            antiFpWebrtc: true,
          }),
        });
        const data = await res.json();
        if (data.error) {
          alert('Lỗi: ' + data.error);
        } else {
          showToast(`Khởi động thành công!`);
        }
      } catch (err) {
        alert('Lỗi gửi lệnh: ' + err.message);
      } finally {
        await pollState();
      }
    });
