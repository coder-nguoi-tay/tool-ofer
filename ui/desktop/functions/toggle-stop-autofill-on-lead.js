/**
 * Bật chế độ dừng sau lead và tự chọn chờ 2×30s nếu chưa chọn thời gian chờ.
 * @param {boolean} checked Trạng thái checkbox dừng autofill sau lead.
 * @return {void} Giữ lựa chọn 20s/30s hiện có và đồng bộ giao diện.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
function toggleStopAutofillOnLead(checked) {
  const checkbox = document.getElementById('cbxStopAutofillOnLead');
  if (checkbox) checkbox.checked = Boolean(checked);
  try {
    localStorage.setItem('autoleadpc_stop_autofill_on_lead', String(Boolean(checked)));
  } catch { }
  if (checked && !getLeadCheckSettings().enableLeadCheck) selectLeadCheckInterval(30, true);
  syncOptionPills();
}
