/**
 * Normalize the Mac sequential count before serializing the request.
 * @param {string|number} value Count from the Mac form.
 * @return {string} Canonical count bounded by the Mac UI cap.
 * @throws {Error} When the count is empty, malformed, or not a positive decimal integer.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-20
 */
function getMacSequentialRequestedCount(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) throw new Error('Số cửa sổ phải là số nguyên dương.');
  const digits = raw.replace(/^0+(?=\d)/, '');
  if (digits === '0') throw new Error('Số cửa sổ phải là số nguyên dương.');
  const maximum = '256';
  if (digits.length > maximum.length || digits.length === maximum.length && digits > maximum) {
    throw new Error('Số cửa sổ phải nằm trong khoảng 1 đến 256.');
  }
  return digits;
}

// ── Chế độ tuần tự ────────────────────────────────────────────────────
/**
 * Send the Mac sequential-start request with the count preserved as decimal text.
 * @param {void} Không có tham số.
 * @return {Promise<void>} Completes after displaying the server response.
 * @throws {Error} When form access or request processing fails.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-20
 */
async function handleMacSequentialStartClick() {
      const btn = document.querySelector('#sequential-start-btn');
      btn.disabled = true;
      try {
        // Không gửi autofillData/proxyList (server đã có queue) — chỉ gửi config nhỏ
        const full = buildRequestBody();
        const requestedCount = getMacSequentialRequestedCount(full.requestedCount);
        const settings = {
          websiteUrl: full.websiteUrl,
          websiteUrl2: full.websiteUrl2,
          proxyType: full.proxyType,
          autoSubmitForm: full.autoSubmitForm,
          enableLeadCheck: full.enableLeadCheck,
          leadCheckScreen: full.leadCheckScreen || 4,
          leadCheckApiUrl: full.leadCheckApiUrl,
          leadCheckCookie: full.leadCheckCookie,
          leadCheckDatas: full.leadCheckDatas,
          leadCheckInterval: full.leadCheckInterval,
          leadCheckMaxAttempts: full.leadCheckMaxAttempts,
          autoCloseNoLead: full.autoCloseNoLead,
          requestedCount,
          concurrency: requestedCount,
        };
        const res = await fetch('/auto-refill/sequential', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true, settings }),
        }).then((r) => r.json());
        autoRefillStatus.textContent = res.message;
      } catch (err) {
        autoRefillStatus.textContent = err.message;
      } finally {
        btn.disabled = false;
      }
}

document.querySelector('#sequential-start-btn').addEventListener('click', handleMacSequentialStartClick);
