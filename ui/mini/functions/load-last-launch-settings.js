/**
 * Load last launch settings.
 * @return {Promise<void>} Kết quả xử lý load last launch settings.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadLastLaunchSettings() {
      try {
        const res = await fetch('/launch-settings');
        if (!res.ok) return;
        const data = await res.json();
        if (data?.settings) {
          const s = data.settings;
          if (s.browserMode) setBrowserMode(s.browserMode);
          if (s.websiteUrl) document.getElementById('inputWebsiteUrl').value = s.websiteUrl;
          if (s.websiteUrl2) document.getElementById('inputWebsiteUrl2').value = s.websiteUrl2;
          if (s.websiteUrl3) document.getElementById('inputWebsiteUrl3').value = s.websiteUrl3;
          if (s.websiteUrl4) document.getElementById('inputWebsiteUrl4').value = s.websiteUrl4;

          if (s.websiteUrl2 || s.websiteUrl3 || s.websiteUrl4) {
            document.getElementById('detailsMultiLinks').open = true;
          }

          if (s.timeLimit) document.getElementById('inputTimeLimit').value = s.timeLimit;
          if (s.completeText) document.getElementById('inputCompleteText').value = s.completeText;
          if (s.delayStart) document.getElementById('inputDelayStart').value = s.delayStart;
          if (s.delayStop) document.getElementById('inputDelayStop').value = s.delayStop;

          if (s.requestedCount || s.concurrency) {
            const count = String(s.requestedCount || s.concurrency);
            inputThreadCount.value = count;
            document.querySelectorAll('#threadsPills .pill-btn').forEach((b) => {
              b.classList.toggle('active', b.dataset.thread === count);
            });
          }
          if (s.limitRun !== undefined) document.getElementById('inputLimitRun').value = s.limitRun;

          // Đồng bộ các checkbox tuỳ chọn thực thi & chế độ ngầm
          if (s.runInApp !== undefined) document.getElementById('cbxRunInApp').checked = Boolean(s.runInApp);
          if (s.multiTab !== undefined) document.getElementById('cbxMultiTab').checked = Boolean(s.multiTab);
          if (s.useCloakBrowser !== undefined) document.getElementById('cbxCloakBrowser').checked = Boolean(s.useCloakBrowser);
          if (s.dataSaver !== undefined) document.getElementById('cbxDataSaver').checked = Boolean(s.dataSaver);
          if (s.checkDuplicate !== undefined) document.getElementById('cbxCheckDuplicateIP').checked = Boolean(s.checkDuplicate);
          if (s.hideUntilTarget !== undefined) document.getElementById('cbxHideUntilTarget').checked = Boolean(s.hideUntilTarget);
          if (s.hideUntilLead !== undefined) document.getElementById('cbxHideUntilLead').checked = Boolean(s.hideUntilLead);
          if (s.enableLeadCheck !== undefined) document.getElementById('cbxCheckLead').checked = Boolean(s.enableLeadCheck);
          if (s.aiAssist !== undefined) document.getElementById('cbxAiAssist').checked = Boolean(s.aiAssist);
          if (s.saveRRS !== undefined) document.getElementById('cbxRRS').checked = Boolean(s.saveRRS);
          if (s.autoSubmitForm !== undefined) document.getElementById('cbxAutoSubmit').checked = Boolean(s.autoSubmitForm);

          // Đồng bộ các hệ điều hành giả lập
          if (s.Windows !== undefined) document.getElementById('chkWindows').checked = Boolean(s.Windows);
          if (s.Mac !== undefined) document.getElementById('chkMac').checked = Boolean(s.Mac);
          if (s.Linux !== undefined) document.getElementById('chkLinux').checked = Boolean(s.Linux);
          if (s.Android !== undefined) document.getElementById('chkAndroid').checked = Boolean(s.Android);
          if (s.iPhone !== undefined) document.getElementById('chkIphone').checked = Boolean(s.iPhone);
          if (s.iPad !== undefined) document.getElementById('chkIpad').checked = Boolean(s.iPad);

          syncOptionPills();
        }
      } catch (err) {}
    }
