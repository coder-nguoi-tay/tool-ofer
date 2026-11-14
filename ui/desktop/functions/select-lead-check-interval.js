/**
 * Bật/tắt chờ lead 2×30s; tắt thì bỏ luôn chế độ chỉ hiện khi có lead và dừng autofill khi có lead.
 * @param {number} seconds Giữ tham số cũ cho các lời gọi sẵn có; chỉ còn lựa chọn 30 giây.
 * @param {boolean} checked Trạng thái người dùng vừa chọn.
 * @return {void} Đồng bộ checkbox và hiển thị option pill.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-13
 */
function selectLeadCheckInterval(seconds, checked) {
  const selected = document.getElementById('cbxCheckLead');
  if (selected) selected.checked = checked;
  if (!getLeadCheckSettings().enableLeadCheck) {
    const hideUntilLead = document.getElementById('cbxHideUntilLead');
    if (hideUntilLead) hideUntilLead.checked = false;
    const stopAfterLead = document.getElementById('cbxStopAutofillOnLead');
    if (stopAfterLead) stopAfterLead.checked = false;
  }
  syncOptionPills();
}
