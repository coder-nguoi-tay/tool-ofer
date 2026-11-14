/**
 * Đọc lựa chọn chờ lead (2×30s); không chọn thì không chờ.
 * @return {object} Cờ bật kiểm tra và số giây của mỗi lượt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
function getLeadCheckSettings() {
  const enableLeadCheck = Boolean(document.getElementById('cbxCheckLead')?.checked);
  return { enableLeadCheck, leadCheckInterval: 30,
    stopAutofillOnLead: enableLeadCheck && Boolean(document.getElementById('cbxStopAutofillOnLead')?.checked) };
}
