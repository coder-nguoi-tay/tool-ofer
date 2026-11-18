/**
 * Đồng bộ chế độ hiển thị cửa sổ giữa:
 * 1. Chạy trong app (cbxRunInApp) - Chạy ngầm trong app, xem qua tab Screen View, không hiện cửa sổ ngoài Desktop.
 * 2. Ẩn đến trang đích (cbxHideUntilTarget) - Chạy ngầm cửa sổ Desktop, chỉ hiển thị ra Desktop khi vào trang đích.
 * 3. Chỉ hiện khi có Lead (cbxHideUntilLead) - Chạy ngầm cửa sổ Desktop, chỉ hiển thị ra Desktop khi IP bắt trúng lead.
 *
 * Logic loại trừ tương hỗ (mutually exclusive):
 * - Khi bật 1 trong 3 nút, 2 nút còn lại tự động tắt.
 * - Khi tắt cả 3 nút: Trình duyệt mở cửa sổ ngoài Desktop bình thường ngay từ lúc khởi động.
 * - Khi bật Obscura V8 (headless native engine): bắt buộc chạy trong app (cbxRunInApp = true), không thể hiện cửa sổ Desktop.
 * - Nếu Obscura đang bật mà người dùng chọn mở cửa sổ Desktop (bỏ tick "Chạy trong app" hoặc tick "Ẩn đến trang đích" / "Chỉ hiện khi có Lead"), hệ thống tự động tắt Obscura (chuyển về Chrome) để đáp ứng mong muốn hiển thị Desktop của người dùng.
 * - Khi bật "Chỉ hiện khi có Lead", nếu chưa bật kiểm tra lead thì tự động kích hoạt Check Lead 2x30s.
 *
 * @param {'runInApp' | 'hideUntilTarget' | 'hideUntilLead'} changedSource Tùy chọn vừa thay đổi.
 * @param {boolean} checked Trạng thái bật/tắt.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
function syncWindowDisplayMode(changedSource, checked) {
  const cbxRunInApp = document.getElementById('cbxRunInApp');
  const cbxHideTarget = document.getElementById('cbxHideUntilTarget');
  const cbxHideLead = document.getElementById('cbxHideUntilLead');
  const cbxObscura = document.getElementById('cbxObscura');

  if (changedSource === 'runInApp') {
    if (cbxRunInApp) cbxRunInApp.checked = Boolean(checked);
    if (checked) {
      if (cbxHideTarget) cbxHideTarget.checked = false;
      if (cbxHideLead) cbxHideLead.checked = false;
      try {
        localStorage.setItem('autoleadpc_run_in_app', 'true');
        localStorage.setItem('autoleadpc_hide_until_target', 'false');
        localStorage.setItem('autoleadpc_hide_until_lead', 'false');
      } catch { }
    } else {
      if (cbxObscura && cbxObscura.checked && typeof syncObscuraSetting === 'function') {
        syncObscuraSetting(false);
      }
      try {
        localStorage.setItem('autoleadpc_run_in_app', 'false');
      } catch { }
    }
  } else if (changedSource === 'hideUntilTarget') {
    if (cbxHideTarget) cbxHideTarget.checked = Boolean(checked);
    if (checked) {
      if (cbxRunInApp) cbxRunInApp.checked = false;
      if (cbxHideLead) cbxHideLead.checked = false;
      if (cbxObscura && cbxObscura.checked && typeof syncObscuraSetting === 'function') {
        syncObscuraSetting(false);
      }
      try {
        localStorage.setItem('autoleadpc_hide_until_target', 'true');
        localStorage.setItem('autoleadpc_run_in_app', 'false');
        localStorage.setItem('autoleadpc_hide_until_lead', 'false');
      } catch { }
    } else {
      try {
        localStorage.setItem('autoleadpc_hide_until_target', 'false');
      } catch { }
    }
  } else if (changedSource === 'hideUntilLead') {
    if (cbxHideLead) cbxHideLead.checked = Boolean(checked);
    if (checked) {
      if (cbxRunInApp) cbxRunInApp.checked = false;
      if (cbxHideTarget) cbxHideTarget.checked = false;
      if (cbxObscura && cbxObscura.checked && typeof syncObscuraSetting === 'function') {
        syncObscuraSetting(false);
      }
      if (typeof getLeadCheckSettings === 'function' && !getLeadCheckSettings().enableLeadCheck) {
        if (typeof selectLeadCheckInterval === 'function') {
          selectLeadCheckInterval(30, true);
        }
      }
      try {
        localStorage.setItem('autoleadpc_hide_until_lead', 'true');
        localStorage.setItem('autoleadpc_run_in_app', 'false');
        localStorage.setItem('autoleadpc_hide_until_target', 'false');
      } catch { }
    } else {
      try {
        localStorage.setItem('autoleadpc_hide_until_lead', 'false');
      } catch { }
    }
  }

  if (typeof syncOptionPills === 'function') {
    syncOptionPills();
  }
}
window.syncWindowDisplayMode = syncWindowDisplayMode;
