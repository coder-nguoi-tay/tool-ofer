/** @var {number} Hard finite Mini UI bound; the server applies its configured live-browser cap. */
const MINI_REQUESTED_COUNT_CAP = 256;

/**
 * Parse a Mini session count as exact decimal text without Number precision loss.
 * @param {string|number} value Count from the input or persisted settings.
 * @return {string|null} Canonical count text, or null if malformed/outside 1..256.
 * @throws {never} Invalid values return null.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function parseMiniRequestedThreadCount(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;
  const digits = raw.replace(/^0+(?=\d)/, '');
  if (digits === '0') return null;
  const maximum = String(MINI_REQUESTED_COUNT_CAP);
  return digits.length > maximum.length || digits.length === maximum.length && digits > maximum ? null : digits;
}

/**
 * Normalize an optional Mini session count for saved and loaded preferences.
 * @param {string|number} value Count from the input or persisted settings.
 * @return {string} Canonical count, with malformed values normalized to 1.
 * @throws {never} Invalid values use the UI fallback and do not throw.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function normalizeMiniRequestedThreadCount(value) {
  const raw = String(value ?? '').trim();
  if (/^\d+$/.test(raw)) {
    const digits = raw.replace(/^0+(?=\d)/, '');
    const maximum = String(MINI_REQUESTED_COUNT_CAP);
    if (digits !== '0' && (digits.length > maximum.length || digits.length === maximum.length && digits > maximum)) {
      return maximum;
    }
  }
  return parseMiniRequestedThreadCount(value) || '1';
}

/**
 * Normalize the live Mini count field before save handlers read it.
 * @param {Event} event Input/change event from the Mini count field.
 * @return {void} The field contains canonical bounded decimal text.
 * @throws {never} Invalid input is normalized and does not throw.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function normalizeMiniRequestedThreadField(event) {
  const field = event?.currentTarget;
  if (field) field.value = normalizeMiniRequestedThreadCount(field.value);
}

/**
 * Load last launch settings.
 * @param {void} Không có tham số.
 * @return {Promise<void>} Kết quả xử lý load last launch settings.
 * @throws {never} Lỗi tải cấu hình được bỏ qua để Mini vẫn có thể sử dụng.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadLastLaunchSettings() {
      const threadField = typeof inputThreadCount !== 'undefined' ? inputThreadCount : document.getElementById('inputThreadCount');
      if (threadField && !threadField._countValidationListener) {
        threadField._countValidationListener = true;
        threadField.addEventListener('input', normalizeMiniRequestedThreadField);
        threadField.addEventListener('change', normalizeMiniRequestedThreadField);
      }
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

          if (s.maxRunMinutes !== undefined) document.getElementById('inputTimeLimit').value = s.maxRunMinutes;
          if (s.completeText) document.getElementById('inputCompleteText').value = s.completeText;
          if (s.delayStart) document.getElementById('inputDelayStart').value = s.delayStart;
          if (s.delayStop) document.getElementById('inputDelayStop').value = s.delayStop;

          if (s.requestedCount !== undefined || s.concurrency !== undefined) {
            const count = normalizeMiniRequestedThreadCount(s.requestedCount ?? s.concurrency);
            inputThreadCount.value = count;
            document.querySelectorAll('#threadsPills .pill-btn').forEach((b) => {
              b.classList.toggle('active', b.dataset.thread === count);
            });
          }
          if (s.limitRun !== undefined) document.getElementById('inputLimitRun').value = s.limitRun;

          // Đồng bộ các checkbox tuỳ chọn thực thi & chế độ ngầm
          if (s.runInApp !== undefined) document.getElementById('cbxRunInApp').checked = Boolean(s.runInApp);
          if (s.multiTab !== undefined) document.getElementById('cbxMultiTab').checked = Boolean(s.multiTab);
          if (s.dataSaver !== undefined) document.getElementById('cbxDataSaver').checked = Boolean(s.dataSaver);
          if (s.checkDuplicate !== undefined) document.getElementById('cbxCheckDuplicateIP').checked = Boolean(s.checkDuplicate);
          if (s.hideUntilTarget !== undefined) document.getElementById('cbxHideUntilTarget').checked = Boolean(s.hideUntilTarget);
          if (s.hideUntilLead !== undefined) document.getElementById('cbxHideUntilLead').checked = Boolean(s.hideUntilLead);
          if (s.enableLeadCheck !== undefined) document.getElementById('cbxCheckLead').checked = Boolean(s.enableLeadCheck);
          if (s.stopAutofillOnLead !== undefined) document.getElementById('cbxStopAutofillOnLead').checked = Boolean(s.stopAutofillOnLead);
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
