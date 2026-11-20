/** @var {number} Hard finite UI bound; the server applies its configured live-browser cap. */
const MAX_REQUESTED_THREAD_COUNT = 256;

/**
 * Parse a positive decimal thread count without precision loss.
 * @param {string|number} value Số luồng từ ô nhập hoặc cấu hình đã lưu.
 * @return {string|null} Chuỗi thập phân chuẩn hóa, hoặc null nếu sai định dạng.
 * @throws {never} Giá trị sai định dạng được trả về dưới dạng null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function parseRequestedThreadCount(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const digits = raw.replace(/^0+(?=\d)/, '');
  if (digits === '0') return null;
  const maximum = String(MAX_REQUESTED_THREAD_COUNT);
  return digits.length > maximum.length || digits.length === maximum.length && digits > maximum ? null : digits;
}

/**
 * Chuẩn hóa số luồng thành chuỗi thập phân trong giới hạn an toàn của giao diện.
 * @param {string|number} value Số luồng từ ô nhập hoặc cấu hình đã lưu.
 * @return {string} Số nguyên dương dạng thập phân, mặc định là 1.
 * @throws {never} Giá trị không hợp lệ được chuẩn hóa về fallback, không ném lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function normalizeRequestedThreadCount(value) {
  const raw = String(value ?? '').trim();
  if (/^\d+$/.test(raw)) {
    const digits = raw.replace(/^0+(?=\d)/, '');
    const maximum = String(MAX_REQUESTED_THREAD_COUNT);
    if (digits !== '0' && (digits.length > maximum.length || digits.length === maximum.length && digits > maximum)) {
      return maximum;
    }
  }
  return parseRequestedThreadCount(value) || '1';
}

/**
 * Nạp các lựa chọn chạy của offer và chuẩn hóa các checkbox phụ thuộc nhau.
 * @param {object} [options={}] Cấu hình offer; trường thiếu giữ lựa chọn hiện có cho preset cũ.
 * @return {void} Giao diện có các lựa chọn nhất quán, Obscura luôn dùng preview trong app.
 * @throws {never} Giá trị giao diện không hợp lệ được chuẩn hóa, không ném lỗi.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
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
    if (element && options[field] !== undefined) {
      element.value = field === 'Thread' ? normalizeRequestedThreadCount(options[field]) : String(options[field]);
    }
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
