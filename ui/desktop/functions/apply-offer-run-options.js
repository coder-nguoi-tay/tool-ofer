/**
 * Nạp các lựa chọn chạy của offer và chuẩn hóa các checkbox phụ thuộc nhau.
 * @param {object} [options={}] Cấu hình offer; trường thiếu giữ lựa chọn hiện có cho preset cũ.
 * @return {void} Giao diện có các lựa chọn nhất quán, Obscura luôn dùng preview trong app.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
function applyOfferRunOptions(options = {}) {
  const checkboxFields = {
    multiTab: ['cbxMultiTab', 'autoleadpc_multi_tab'],
    CheckDuplicate: ['cbxCheckDuplicateIP', 'autoleadpc_check_duplicate'],
    dataSaver: ['cbxDataSaver', 'autoleadpc_data_saver'],
  };
  const valueFields = {
    runMode: ['cbxAuto', 'autoleadpc_run_mode'],
    Thread: ['nudThread', 'autoleadpc_thread_count'],
    LimitRun: ['nudLimitRun', 'autoleadpc_limit_run'],
    choiceDelay: ['nudChoiceDelay', 'autoleadpc_choice_delay_seconds'],
    offerSolver: ['cbbOfferSolver', 'autoleadpc_offer_solver'],
  };
  for (const [field, [id]] of Object.entries(checkboxFields)) {
    const element = document.getElementById(id);
    if (element && options[field] !== undefined) element.checked = Boolean(options[field]);
  }
  for (const [field, [id]] of Object.entries(valueFields)) {
    const element = document.getElementById(id);
    if (element && options[field] !== undefined) element.value = String(options[field]);
  }
  if (options.enableChoiceDelay !== undefined) toggleChoiceDelay(Boolean(options.enableChoiceDelay));
  if (options.enableLeadCheck !== undefined) selectLeadCheckInterval(30, Boolean(options.enableLeadCheck));
  if (options.stopAutofillOnLead !== undefined) {
    toggleStopAutofillOnLead(Boolean(options.stopAutofillOnLead)
      && options.enableLeadCheck !== false);
  }

  const runInApp = document.getElementById('cbxRunInApp');
  const hideTarget = document.getElementById('cbxHideUntilTarget');
  const hideLead = document.getElementById('cbxHideUntilLead');
  const requestedHideLead = options.HideUntilLead ?? Boolean(hideLead?.checked);
  const requestedHideTarget = options.HideUntilTarget ?? Boolean(hideTarget?.checked);
  const requestedInApp = options.runInApp ?? Boolean(runInApp?.checked);
  if (hideTarget) hideTarget.checked = false;
  if (hideLead) hideLead.checked = false;
  if (document.getElementById('cbxObscura')?.checked) {
    syncWindowDisplayMode('runInApp', true);
  } else if (requestedHideLead && options.enableLeadCheck !== false) {
    syncWindowDisplayMode('hideUntilLead', true);
  } else if (requestedHideTarget) {
    syncWindowDisplayMode('hideUntilTarget', true);
  } else {
    syncWindowDisplayMode('runInApp', requestedInApp);
  }

  try {
    for (const [field, [id, key]] of Object.entries(checkboxFields)) {
      const element = document.getElementById(id);
      if (element && options[field] !== undefined) localStorage.setItem(key, String(element.checked));
    }
    for (const [field, [id, key]] of Object.entries(valueFields)) {
      const element = document.getElementById(id);
      if (element && options[field] !== undefined) localStorage.setItem(key, element.value);
    }
  } catch { }
  syncOptionPills();
}
window.applyOfferRunOptions = applyOfferRunOptions;
