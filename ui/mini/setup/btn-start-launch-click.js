// Đồng bộ class .active cho các option pills khi checkbox thay đổi

    // Đọc cấu hình gần nhất

    /**
     * Gửi lệnh chạy giống app chính: tự lưu offer, nhập proxy ở tab Tài nguyên kèm giao thức, chạy song song (/launch)
     * hoặc tuần tự (/auto-refill/sequential), kèm anti-fingerprint và thiết bị GoLogin từ tab Cài đặt.
     * @param {object} [options] executeSchedule=true khi tới giờ hẹn (bỏ qua bước đặt hẹn giờ); offerIndex = offer
     *   được hẹn (1-4), khi đó chỉ chạy đúng link của offer đó thay vì mọi link.
     * @return {Promise<void>}
     * @author ductv <ductv@getflycrm.com>
     * @since 2026-11-14
     */
    async function miniRunStart(options = {}) {
      const btnStart = document.getElementById('btnStartLaunch');
      if (btnStart && (btnStart.disabled || (activeSessions && activeSessions.length > 0))) {
        showToast(options.offerIndex
          ? `⚠️ Tới giờ hẹn Offer ${options.offerIndex} nhưng đang có luồng chạy; bỏ qua lượt hẹn này.`
          : '⚠️ Đang có luồng chạy! Vui lòng dừng luồng trước khi bắt đầu lại.', 'warning');
        return;
      }

      const collected = miniRunCollectOfferUrls();
      const scheduledUrls = options.offerIndex ? miniRunScheduledOfferUrls(options.offerIndex) : null;
      if (scheduledUrls && !scheduledUrls.length) {
        showToast(`⚠️ Tới giờ hẹn Offer ${options.offerIndex} nhưng link của offer này đang trống.`);
        return;
      }
      // Hẹn giờ theo link: chỉ chạy link của offer tới giờ; chạy tay thì chạy mọi link như cũ.
      const offerUrls = scheduledUrls || collected.offerUrls;
      const [websiteUrl = '', websiteUrl2 = '', websiteUrl3 = '', websiteUrl4 = ''] = scheduledUrls || [collected.websiteUrl, collected.websiteUrl2, collected.websiteUrl3, collected.websiteUrl4];
      if (!websiteUrl) {
        alert('Vui lòng nhập Link Offer / Website!');
        return;
      }
      const schedules = miniRunGetSchedules().filter(item => item.enabled);
      if (!options.executeSchedule && schedules.length > 0 && miniRunStartScheduler(schedules, item => miniRunStart({ executeSchedule: true, offerIndex: item.offerIndex }))) {
        showToast('⏰ Đã hẹn giờ chạy; để mini mở tới giờ hẹn.');
        return;
      }

      const concurrency = parseInt(inputThreadCount.value, 10) || 1;
      const limitRun = parseInt(document.getElementById('inputLimitRun').value, 10) || 0;
      // Chờ tối đa (phút): phiên chạy quá thời gian này thì tự tắt và bù slot; 0 = không giới hạn.
      const maxRunMinutes = Math.max(0, parseFloat(document.getElementById('inputTimeLimit').value) || 0);
      const delayStart = parseInt(document.getElementById('inputDelayStart').value, 10) || 1;
      const delayStop = parseInt(document.getElementById('inputDelayStop').value, 10) || 1;
      const enableChoiceDelay = Boolean(document.getElementById('cbxChoiceDelay')?.checked);
      const choiceDelay = enableChoiceDelay ? (parseInt(document.getElementById('inputChoiceDelay')?.value, 10) || 2) : 0;
      const completeText = document.getElementById('inputCompleteText').value.trim();

      const runInApp = document.getElementById('cbxRunInApp').checked;
      const multiTab = document.getElementById('cbxMultiTab').checked;
      const dataSaver = document.getElementById('cbxDataSaver').checked;
      const checkDuplicate = document.getElementById('cbxCheckDuplicateIP').checked;
      const hideUntilTarget = document.getElementById('cbxHideUntilTarget').checked;
      const hideUntilLead = document.getElementById('cbxHideUntilLead').checked;
      const stopAutofillOnLead = Boolean(document.getElementById('cbxStopAutofillOnLead')?.checked);
      const enableLeadCheck = document.getElementById('cbxCheckLead').checked || stopAutofillOnLead;
      const autoSubmitForm = document.getElementById('cbxAutoSubmit').checked;
      const sequential = document.getElementById('miniRunMode')?.value === 'sequential';

      const Windows = document.getElementById('chkWindows').checked;
      const Mac = document.getElementById('chkMac').checked;
      const Linux = document.getElementById('chkLinux').checked;
      const Android = document.getElementById('chkAndroid').checked;
      const iPhone = document.getElementById('chkIphone').checked;
      const iPad = document.getElementById('chkIpad').checked;
      // Anti-fingerprint và biến thể thiết bị GoLogin lấy từ tab Cài đặt (cùng giá trị app chính gửi).
      const overrides = typeof miniSetGetLaunchOverrides === 'function' ? miniSetGetLaunchOverrides() : {};
      const useObscura = currentBrowserMode === 'Obscura';
      const useGoLogin = !useObscura && currentBrowserMode === 'GoLogin';
      const browserMode = useObscura ? 'Obscura' : (useGoLogin ? 'GoLogin' : 'Chrome');

      // Khóa và làm mờ nút Start ngay khi bắt đầu bấm
      if (btnStart) {
        btnStart.disabled = true;
        btnStart.textContent = '⏳ ĐANG KHỞI CHẠY...';
      }

      showToast(`Đang khởi động ${concurrency} luồng (${currentBrowserMode}${sequential ? ', tuần tự' : ''})...`);
      try {
        // Tự lưu offer để không mất link vừa nhập, giống app chính.
        await miniRunSaveOffer(true);
        const proxyList = (document.getElementById('taProxyInput')?.value || '').trim();
        const proxyType = document.getElementById('resProxyType')?.value || 'socks5';
        if (proxyList) {
          await fetch('/proxy-queue/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ proxyList, proxyType }) });
        }
        const streamCount = Math.max(concurrency, offerUrls.length >= 2 ? offerUrls.length : 1);
        const settings = {
          browserMode,
          useObscura,
          useGoLogin,
          ...(useGoLogin && overrides.gologinDevices ? { gologinDevices: overrides.gologinDevices } : {}),
          websiteUrl,
          websiteUrl2,
          websiteUrl3,
          websiteUrl4,
          offerUrls,
          offerList: offerUrls,
          requestedCount: sequential ? streamCount : concurrency,
          concurrency: sequential ? streamCount : concurrency,
          proxyList,
          proxyType,
          limitRun,
          maxRunMinutes,
          delayStart,
          delayStop,
          choiceDelay,
          enableChoiceDelay,
          completeText,
          autoSubmitForm,
          checkDuplicate,
          dataSaver,
          runInApp,
          screenPreviewOnly: runInApp,
          multiTab,
          hideUntilTarget,
          hideBrowser: hideUntilTarget,
          hideUntilLead,
          enableLeadCheck,
          autoCloseNoLead: enableLeadCheck,
          stopAutofillOnLead,
          leadCheckInterval: 30,
          leadCheckMaxAttempts: 2,
          leadCheckScreen: 4,
          Windows,
          Mac,
          Linux,
          Android,
          iPhone,
          iPad,
          antiFpCanvas: overrides.antiFpCanvas ?? true,
          antiFpClientRects: overrides.antiFpClientRects ?? true,
          antiFpWebgl: overrides.antiFpWebgl ?? true,
          antiFpFonts: overrides.antiFpFonts ?? true,
          antiFpApiFakeIP: overrides.antiFpApiFakeIP ?? true,
          antiFpWebrtc: overrides.antiFpWebrtc ?? true,
        };
        const res = sequential
          ? await fetch('/auto-refill/sequential', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: true, settings }) })
          : await fetch('/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
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
    }

    // Nút BẮT ĐẦU CHẠY (START)
    document.getElementById('btnStartLaunch').addEventListener('click', () => miniRunStart());
