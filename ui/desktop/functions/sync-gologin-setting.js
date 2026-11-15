/**
 * Cập nhật thanh hiển thị trạng thái Trình duyệt & Fingerprint trên Dashboard.
 * @return {void}
 */
function updateDashboardBrowserBar() {
  const isGoLogin = Boolean(document.getElementById('cbxGoLogin')?.checked);
  const lblChrome = document.getElementById('lblBrowserChrome');
  const badge = document.getElementById('dashBrowserBadge');

  if (lblChrome) {
    if (isGoLogin) {
      lblChrome.innerHTML = '<input type="radio" name="dashBrowserRadio" id="dashRadioChrome" value="GoLogin" checked style="display:none;">🚀 GoLogin Orbita (SDK Automation)';
      lblChrome.style.color = '#38bdf8';
    } else {
      lblChrome.innerHTML = '<input type="radio" name="dashBrowserRadio" id="dashRadioChrome" value="Chrome" checked style="display:none;">🌐 Google Chrome (Bản chuẩn máy Mac)';
      lblChrome.style.color = '#38bdf8';
    }
  }

  if (badge) {
    if (isGoLogin) {
      badge.textContent = '🛡️ Profile Multi-OS: Windows · Mac · Linux · Android';
      badge.style.color = '#a855f7';
      badge.style.borderColor = 'rgba(168, 85, 247, 0.4)';
      badge.style.background = 'rgba(168, 85, 247, 0.12)';
    } else {
      badge.textContent = '🛡️ Anti-Detect Spoofing: Chrome 150 - 156';
      badge.style.color = '#38bdf8';
      badge.style.borderColor = 'rgba(14, 165, 233, 0.3)';
      badge.style.background = 'rgba(14, 165, 233, 0.15)';
    }
  }
}
window.updateDashboardBrowserBar = updateDashboardBrowserBar;

/**
 * Sync GoLogin setting.
 * @param {boolean} enabled
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
function syncGoLoginSetting(enabled) {
  const cbx = document.getElementById('cbxGoLogin');
  if (cbx && cbx.checked !== enabled) cbx.checked = enabled;
  try {
    localStorage.setItem('autolead_use_gologin', enabled ? '1' : '0');
  } catch {}
  if (typeof syncOptionPills === 'function') {
    syncOptionPills();
  }
  updateDashboardBrowserBar();
}
