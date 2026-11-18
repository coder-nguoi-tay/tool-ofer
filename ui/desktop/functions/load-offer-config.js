/**
 * Load offer config.
 * @return {Promise<void>} Kết quả xử lý load offer config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
async function loadOfferConfig() {
  let restoredRunOptions = {};
  let cachedOfferIdentity = null;
  // 1. Thử nạp nhanh từ localStorage nếu có
  try {
    const cached = localStorage.getItem('autoleadpc_current_offer');
    if (cached) {
      const c = JSON.parse(cached);
      restoredRunOptions = { ...c };
      cachedOfferIdentity = c;
      if (c.NameOffer && document.getElementById('txtNameOffer')) document.getElementById('txtNameOffer').value = c.NameOffer;
      if (c.LinkOffer && document.getElementById('txtLinkOffer')) document.getElementById('txtLinkOffer').value = c.LinkOffer;
      if (c.LinkOffer2 && document.getElementById('txtLinkOffer2')) document.getElementById('txtLinkOffer2').value = c.LinkOffer2;
      if (c.LinkOffer3 && document.getElementById('txtLinkOffer3')) document.getElementById('txtLinkOffer3').value = c.LinkOffer3;
      if (c.LinkOffer4 && document.getElementById('txtLinkOffer4')) document.getElementById('txtLinkOffer4').value = c.LinkOffer4;
      if (c.offerSolver && document.getElementById('cbbOfferSolver')) document.getElementById('cbbOfferSolver').value = c.offerSolver;
      if (c.runMode && document.getElementById('cbxAuto')) document.getElementById('cbxAuto').value = c.runMode;
      if (c.LinkOffer2 || c.LinkOffer3 || c.LinkOffer4) toggleExtraOfferLinks(true);
      if (c.scheduleStop) {
        const cbxStop = document.getElementById('cbxScheduleStop');
        const timeStop = document.getElementById('timeScheduleStop');
        const hintStop = document.getElementById('lblScheduleStopHint');
        if (cbxStop) cbxStop.checked = Boolean(c.scheduleStop.enabled);
        if (timeStop) {
          if (c.scheduleStop.time) timeStop.value = c.scheduleStop.time;
          timeStop.style.display = c.scheduleStop.enabled ? 'inline-block' : 'none';
        }
        if (hintStop) hintStop.style.display = c.scheduleStop.enabled ? 'inline' : 'none';
      }
    }
  } catch { }

  // 2. Nạp từ backend
  const data = await api('/pc/offer/read');
  if (data && !data.error) {
    restoredRunOptions = { ...restoredRunOptions, ...data };
    if (data.NameOffer && document.getElementById('txtNameOffer')) document.getElementById('txtNameOffer').value = data.NameOffer;
    if (data.LinkOffer && document.getElementById('txtLinkOffer')) document.getElementById('txtLinkOffer').value = data.LinkOffer;
    if (data.LinkOffer2 !== undefined && document.getElementById('txtLinkOffer2')) document.getElementById('txtLinkOffer2').value = data.LinkOffer2;
    if (data.LinkOffer3 !== undefined && document.getElementById('txtLinkOffer3')) document.getElementById('txtLinkOffer3').value = data.LinkOffer3;
    if (data.LinkOffer4 !== undefined && document.getElementById('txtLinkOffer4')) document.getElementById('txtLinkOffer4').value = data.LinkOffer4;
    if (data.LinkOffer2 || data.LinkOffer3 || data.LinkOffer4) toggleExtraOfferLinks(true);
    if (document.getElementById('txtTimeLimit')) {
      document.getElementById('txtTimeLimit').value = data.MaxRunMinutes ?? '10';
    }
    if (document.getElementById('txtTextComplete')) {
      if (data.Complete && data.Complete !== 'id') {
        document.getElementById('txtTextComplete').value = data.Complete;
      } else {
        document.getElementById('txtTextComplete').value = '';
      }
    }
    if (data.delayStart && document.getElementById('nudDelayStart')) document.getElementById('nudDelayStart').value = data.delayStart;
    if (data.delayStop && document.getElementById('nudDelayStop')) document.getElementById('nudDelayStop').value = data.delayStop;
    if (data.Thread && document.getElementById('nudThread')) {
      document.getElementById('nudThread').value = Math.min(30, Math.max(1, parseInt(data.Thread) || 1));
    }
    if (data.LimitRun !== undefined && document.getElementById('nudLimitRun')) {
      document.getElementById('nudLimitRun').value = Math.max(0, parseInt(data.LimitRun) || 0);
    }
    if (data.offerSolver && document.getElementById('cbbOfferSolver')) {
      document.getElementById('cbbOfferSolver').value = data.offerSolver;
    }
    if (data.runMode && document.getElementById('cbxAuto')) {
      document.getElementById('cbxAuto').value = data.runMode;
    }

    if (Array.isArray(data.savedList)) {
      currentSavedOffers = data.savedList;
      renderSavedOffersDropdown(currentSavedOffers, data.NameOffer);
    }

    if (Array.isArray(data.schedules)) {
      data.schedules.forEach(s => {
        if (s && s.offerIndex) {
          const cbx = document.getElementById(`cbxScheduleOffer${s.offerIndex}`);
          const timeInput = document.getElementById(`timeScheduleOffer${s.offerIndex}`);
          if (cbx) cbx.checked = Boolean(s.enabled);
          if (timeInput) {
            if (s.time) timeInput.value = s.time;
            timeInput.style.display = s.enabled ? 'inline-block' : 'none';
          }
        }
      });
    }

    if (data.scheduleStop) {
      const cbxStop = document.getElementById('cbxScheduleStop');
      const timeStop = document.getElementById('timeScheduleStop');
      const hintStop = document.getElementById('lblScheduleStopHint');
      if (cbxStop) cbxStop.checked = Boolean(data.scheduleStop.enabled);
      if (timeStop) {
        if (data.scheduleStop.time) timeStop.value = data.scheduleStop.time;
        timeStop.style.display = data.scheduleStop.enabled ? 'inline-block' : 'none';
      }
      if (hintStop) hintStop.style.display = data.scheduleStop.enabled ? 'inline' : 'none';
    }

    applyOfferMethods(Array.isArray(data.methodConfigs) ? data.methodConfigs : []);
  }

  // 3. Chỉ áp cache checkbox khi thuộc cùng offer, hoặc cấu hình backend còn ở định dạng cũ.
  try {
    const useCachedRunOptions = data?.runMode === undefined || (cachedOfferIdentity
      && cachedOfferIdentity.NameOffer === data.NameOffer && cachedOfferIdentity.LinkOffer === data.LinkOffer);
    /**
     * Đọc lựa chọn mới nhất trong trình duyệt chỉ khi cache thuộc offer đang nạp.
     * @param {string} key Khóa lựa chọn. @return {string|null} Giá trị cache phù hợp.
     * @author ductv <ductv@getflycrm.com> @since 2026-11-18
     */
    const readCachedRunOption = key => useCachedRunOptions ? localStorage.getItem(key) : null;
    // Chế độ chạy (cbxAuto: auto | sequential | manual)
    const cachedRunMode = readCachedRunOption('autoleadpc_run_mode');
    const selAuto = document.getElementById('cbxAuto');
    if (selAuto && cachedRunMode) {
      selAuto.value = cachedRunMode;
      restoredRunOptions.runMode = cachedRunMode;
    }
    if (selAuto && !selAuto._hasStorageListener) {
      selAuto._hasStorageListener = true;
      selAuto.addEventListener('change', (e) => {
        try {
          localStorage.setItem('autoleadpc_run_mode', String(e.target.value));
        } catch { }
      });
    }

    // Đa luồng đa tab (cbxMultiTab)
    const cachedMultiTab = readCachedRunOption('autoleadpc_multi_tab');
    const cbxMultiTab = document.getElementById('cbxMultiTab');
    if (cbxMultiTab && cachedMultiTab !== null) {
      cbxMultiTab.checked = (cachedMultiTab === 'true');
      restoredRunOptions.multiTab = cbxMultiTab.checked;
    }
    if (cbxMultiTab && !cbxMultiTab._hasStorageListener) {
      cbxMultiTab._hasStorageListener = true;
      cbxMultiTab.addEventListener('change', (e) => {
        try {
          localStorage.setItem('autoleadpc_multi_tab', String(e.target.checked));
        } catch { }
        syncOptionPills();
      });
    }

    // Tiết kiệm data (cbxDataSaver)
    const cachedDataSaver = readCachedRunOption('autoleadpc_data_saver');
    const cbxDataSaver = document.getElementById('cbxDataSaver');
    if (cbxDataSaver && cachedDataSaver !== null) {
      cbxDataSaver.checked = (cachedDataSaver === 'true');
      restoredRunOptions.dataSaver = cbxDataSaver.checked;
    }
    if (cbxDataSaver && !cbxDataSaver._hasStorageListener) {
      cbxDataSaver._hasStorageListener = true;
      cbxDataSaver.addEventListener('change', (e) => {
        try {
          localStorage.setItem('autoleadpc_data_saver', String(e.target.checked));
        } catch { }
        syncOptionPills();
      });
    }

    // Check duplicate IP (cbxCheckDuplicateIP)
    const cachedDup = readCachedRunOption('autoleadpc_check_duplicate');
    const cbxDup = document.getElementById('cbxCheckDuplicateIP');
    if (cbxDup && cachedDup !== null) {
      cbxDup.checked = (cachedDup === 'true');
      restoredRunOptions.CheckDuplicate = cbxDup.checked;
    }
    if (cbxDup && !cbxDup._hasStorageListener) {
      cbxDup._hasStorageListener = true;
      cbxDup.addEventListener('change', (e) => {
        try {
          localStorage.setItem('autoleadpc_check_duplicate', String(e.target.checked));
        } catch { }
        syncOptionPills();
      });
    }

    // Delay chọn đáp án (cbxChoiceDelay / cbxChoiceDelayPill / nudChoiceDelay)
    const cachedChoiceDelay = readCachedRunOption('autoleadpc_enable_choice_delay');
    if (cachedChoiceDelay !== null && typeof toggleChoiceDelay === 'function') {
      toggleChoiceDelay(cachedChoiceDelay === 'true');
      restoredRunOptions.enableChoiceDelay = cachedChoiceDelay === 'true';
    }
    const cachedDelaySec = readCachedRunOption('autoleadpc_choice_delay_seconds');
    const nudChoiceDelay = document.getElementById('nudChoiceDelay');
    if (nudChoiceDelay && cachedDelaySec) {
      nudChoiceDelay.value = Math.max(1, Math.min(60, parseInt(cachedDelaySec, 10) || 2));
      restoredRunOptions.choiceDelay = Number(nudChoiceDelay.value);
    }
    if (nudChoiceDelay && !nudChoiceDelay._hasStorageListener) {
      nudChoiceDelay._hasStorageListener = true;
      nudChoiceDelay.addEventListener('change', (e) => {
        try {
          localStorage.setItem('autoleadpc_choice_delay_seconds', String(e.target.value));
        } catch { }
      });
    }

    // Chờ Lead (cbxCheckLead: 2x30s) & Dừng autofill sau lead (cbxStopAutofillOnLead)
    const cachedCheckLead = readCachedRunOption('autoleadpc_check_lead');
    const cbxCheckLead = document.getElementById('cbxCheckLead');
    if (cbxCheckLead && cachedCheckLead !== null) {
      cbxCheckLead.checked = (cachedCheckLead === 'true');
      restoredRunOptions.enableLeadCheck = cbxCheckLead.checked;
    }
    const cachedStopLead = readCachedRunOption('autoleadpc_stop_autofill_on_lead');
    const cbxStopLead = document.getElementById('cbxStopAutofillOnLead');
    if (cbxStopLead && cachedStopLead !== null) {
      cbxStopLead.checked = (cachedStopLead === 'true' && Boolean(cbxCheckLead?.checked));
      restoredRunOptions.stopAutofillOnLead = cachedStopLead === 'true';
    }

    // Cụm hiển thị cửa sổ (Chạy trong app | Ẩn đến trang đích | Chỉ hiện khi có Lead)
    const cachedHide = readCachedRunOption('autoleadpc_hide_until_target');
    const cachedHideLead = readCachedRunOption('autoleadpc_hide_until_lead');
    const cachedRunInApp = readCachedRunOption('autoleadpc_run_in_app');
    if (cachedHide !== null) restoredRunOptions.HideUntilTarget = cachedHide === 'true';
    if (cachedHideLead !== null) restoredRunOptions.HideUntilLead = cachedHideLead === 'true';
    if (cachedRunInApp !== null) restoredRunOptions.runInApp = cachedRunInApp === 'true';

    // Khôi phục bộ giải (offerSolver: auto | 2615 | generic)
    const cachedSolver = readCachedRunOption('autoleadpc_offer_solver');
    const cbbSolver = document.getElementById('cbbOfferSolver');
    if (cbbSolver && cachedSolver !== null) {
      cbbSolver.value = cachedSolver;
      restoredRunOptions.offerSolver = cachedSolver;
    }
    if (cbbSolver && !cbbSolver._hasStorageListener) {
      cbbSolver._hasStorageListener = true;
      cbbSolver.addEventListener('change', (e) => {
        try {
          localStorage.setItem('autoleadpc_offer_solver', String(e.target.value));
        } catch { }
      });
    }

    // Khôi phục và ràng buộc tự chuẩn hoá số luồng (nudThread)
    const nudTh = document.getElementById('nudThread');
    const cachedThread = readCachedRunOption('autoleadpc_thread_count');
    if (nudTh) {
      if (cachedThread) {
        nudTh.value = Math.min(30, Math.max(1, parseInt(cachedThread) || 1));
      restoredRunOptions.Thread = nudTh.value;
      }
      if (!nudTh._hasValidationListener) {
        nudTh._hasValidationListener = true;
        nudTh.addEventListener('change', (e) => {
          const val = Math.min(30, Math.max(1, parseInt(e.target.value) || 1));
          e.target.value = val;
          try { localStorage.setItem('autoleadpc_thread_count', String(val)); } catch { }
        });
      }
    }

    // Khôi phục và ràng buộc giới hạn chạy (nudLimitRun)
    const nudLim = document.getElementById('nudLimitRun');
    const cachedLimit = readCachedRunOption('autoleadpc_limit_run');
    if (nudLim) {
      if (cachedLimit !== null) {
        nudLim.value = Math.max(0, parseInt(cachedLimit) || 0);
      restoredRunOptions.LimitRun = nudLim.value;
      }
      if (!nudLim._hasValidationListener) {
        nudLim._hasValidationListener = true;
        nudLim.addEventListener('change', (e) => {
          const val = Math.max(0, parseInt(e.target.value) || 0);
          e.target.value = val;
          try { localStorage.setItem('autoleadpc_limit_run', String(val)); } catch { }
        });
      }
    }

    applyOfferRunOptions(restoredRunOptions);
  } catch { }
}
