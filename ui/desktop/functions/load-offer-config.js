/**
 * Load offer config.
 * @return {Promise<void>} Kết quả xử lý load offer config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadOfferConfig() {
      // 1. Thử nạp nhanh từ localStorage nếu có
      try {
        const cached = localStorage.getItem('autoleadpc_current_offer');
        if (cached) {
          const c = JSON.parse(cached);
          if (c.NameOffer && document.getElementById('txtNameOffer')) document.getElementById('txtNameOffer').value = c.NameOffer;
          if (c.LinkOffer && document.getElementById('txtLinkOffer')) document.getElementById('txtLinkOffer').value = c.LinkOffer;
          if (c.LinkOffer2 && document.getElementById('txtLinkOffer2')) document.getElementById('txtLinkOffer2').value = c.LinkOffer2;
          if (c.LinkOffer3 && document.getElementById('txtLinkOffer3')) document.getElementById('txtLinkOffer3').value = c.LinkOffer3;
          if (c.LinkOffer4 && document.getElementById('txtLinkOffer4')) document.getElementById('txtLinkOffer4').value = c.LinkOffer4;
          if (c.LinkOffer2 || c.LinkOffer3 || c.LinkOffer4) toggleExtraOfferLinks(true);
        }
      } catch { }

      // 2. Nạp từ backend
      const data = await api('/pc/offer/read');
      if (data && !data.error) {
        if (data.NameOffer) document.getElementById('txtNameOffer').value = data.NameOffer;
        if (data.LinkOffer) document.getElementById('txtLinkOffer').value = data.LinkOffer;
        if (data.LinkOffer2 !== undefined && data.LinkOffer2 !== '') document.getElementById('txtLinkOffer2').value = data.LinkOffer2;
        if (data.LinkOffer3 !== undefined && data.LinkOffer3 !== '') document.getElementById('txtLinkOffer3').value = data.LinkOffer3;
        if (data.LinkOffer4 !== undefined && data.LinkOffer4 !== '') document.getElementById('txtLinkOffer4').value = data.LinkOffer4;
        if (data.LinkOffer2 || data.LinkOffer3 || data.LinkOffer4) toggleExtraOfferLinks(true);
        if (data.TimeLimit) document.getElementById('txtTimeLimit').value = data.TimeLimit;
        if (data.Complete && data.Complete !== 'id') {
          document.getElementById('txtTextComplete').value = data.Complete;
        } else {
          document.getElementById('txtTextComplete').value = '';
        }
        if (data.delayStart) document.getElementById('nudDelayStart').value = data.delayStart;
        if (data.delayStop) document.getElementById('nudDelayStop').value = data.delayStop;
        if (data.Thread && document.getElementById('nudThread')) {
          document.getElementById('nudThread').value = Math.min(30, Math.max(1, parseInt(data.Thread) || 1));
        }
        if (data.LimitRun !== undefined && document.getElementById('nudLimitRun')) {
          document.getElementById('nudLimitRun').value = Math.max(0, parseInt(data.LimitRun) || 0);
        }

        if (Array.isArray(data.savedList)) {
          currentSavedOffers = data.savedList;
          renderSavedOffersDropdown(currentSavedOffers, data.NameOffer);
        }

        applyOfferMethods(Array.isArray(data.methodConfigs) ? data.methodConfigs : []);
      }

      // Khôi phục trạng thái checkbox Ẩn trình duyệt & Check duplicate
      try {
        const cachedHide = localStorage.getItem('autoleadpc_hide_until_target');
        const cbxHide = document.getElementById('cbxHideUntilTarget');
        if (cbxHide && cachedHide !== null) {
          cbxHide.checked = (cachedHide === 'true');
        }
        if (cbxHide && !cbxHide._hasStorageListener) {
          cbxHide._hasStorageListener = true;
          cbxHide.addEventListener('change', (e) => {
            try {
              localStorage.setItem('autoleadpc_hide_until_target', String(e.target.checked));
            } catch { }
          });
        }

        const cachedDup = localStorage.getItem('autoleadpc_check_duplicate');
        const cbxDup = document.getElementById('cbxCheckDuplicateIP');
        if (cbxDup && cachedDup !== null) {
          cbxDup.checked = (cachedDup === 'true');
        }
        if (cbxDup && !cbxDup._hasStorageListener) {
          cbxDup._hasStorageListener = true;
          cbxDup.addEventListener('change', (e) => {
            try {
              localStorage.setItem('autoleadpc_check_duplicate', String(e.target.checked));
            } catch { }
          });
        }

        const cachedDataSaver = localStorage.getItem('autoleadpc_data_saver');
        const cbxDataSaver = document.getElementById('cbxDataSaver');
        if (cbxDataSaver && cachedDataSaver !== null) {
          cbxDataSaver.checked = (cachedDataSaver === 'true');
        }
        if (cbxDataSaver && !cbxDataSaver._hasStorageListener) {
          cbxDataSaver._hasStorageListener = true;
          cbxDataSaver.addEventListener('change', (e) => {
            try {
              localStorage.setItem('autoleadpc_data_saver', String(e.target.checked));
            } catch { }
          });
        }

        const cachedHideLead = localStorage.getItem('autoleadpc_hide_until_lead');
        const cbxHideLead = document.getElementById('cbxHideUntilLead');
        if (cbxHideLead && cachedHideLead !== null) {
          cbxHideLead.checked = (cachedHideLead === 'true');
        }
        if (cbxHideLead && !cbxHideLead._hasStorageListener) {
          cbxHideLead._hasStorageListener = true;
          cbxHideLead.addEventListener('change', (e) => {
            try {
              localStorage.setItem('autoleadpc_hide_until_lead', String(e.target.checked));
            } catch { }
          });
        }

        // Tự động bật Chạy trong app (mặc định là true nếu chưa lưu)
        const cachedRunInApp = localStorage.getItem('autoleadpc_run_in_app');
        const cbxRunInApp = document.getElementById('cbxRunInApp');
        if (cbxRunInApp) {
          cbxRunInApp.checked = (cachedRunInApp === null ? true : cachedRunInApp === 'true');
        }
        if (cbxRunInApp && !cbxRunInApp._hasStorageListener) {
          cbxRunInApp._hasStorageListener = true;
          cbxRunInApp.addEventListener('change', (e) => {
            try {
              localStorage.setItem('autoleadpc_run_in_app', String(e.target.checked));
            } catch { }
            syncOptionPills();
          });
        }

        // Khôi phục và ràng buộc tự chuẩn hoá số luồng (nudThread)
        const nudTh = document.getElementById('nudThread');
        const cachedThread = localStorage.getItem('autoleadpc_thread_count');
        if (nudTh) {
          if (cachedThread) {
            nudTh.value = Math.min(30, Math.max(1, parseInt(cachedThread) || 1));
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
        const cachedLimit = localStorage.getItem('autoleadpc_limit_run');
        if (nudLim) {
          if (cachedLimit !== null) {
            nudLim.value = Math.max(0, parseInt(cachedLimit) || 0);
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
        syncOptionPills();
      } catch { }
    }
