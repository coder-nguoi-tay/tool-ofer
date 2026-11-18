/**
 * Cập nhật thanh hiển thị trạng thái Trình duyệt & Fingerprint trên Dashboard.
 * @return {void}
 */
function updateDashboardBrowserBar() {
  const isObscura = Boolean(document.getElementById('cbxObscura')?.checked);
  const isGoLogin = !isObscura && Boolean(document.getElementById('cbxGoLogin')?.checked);
  const lblChrome = document.getElementById('lblBrowserChrome');
  const badge = document.getElementById('dashBrowserBadge');

  if (lblChrome) {
    if (isObscura) {
      lblChrome.innerHTML = '<input type="radio" name="dashBrowserRadio" id="dashRadioChrome" value="Obscura" checked style="display:none;">⚡ Obscura V8 (Rust Native Engine)';
      lblChrome.style.color = '#10b981';
    } else if (isGoLogin) {
      lblChrome.innerHTML = '<input type="radio" name="dashBrowserRadio" id="dashRadioChrome" value="GoLogin" checked style="display:none;">🚀 GoLogin Orbita (SDK Automation)';
      lblChrome.style.color = '#38bdf8';
    } else {
      lblChrome.innerHTML = '<input type="radio" name="dashBrowserRadio" id="dashRadioChrome" value="Chrome" checked style="display:none;">🌐 Google Chrome (Bản chuẩn máy Mac)';
      lblChrome.style.color = '#38bdf8';
    }
  }

  if (badge) {
    if (isObscura) {
      badge.textContent = '🛡️ V8 Native Anti-Detect: Canvas/Audio PRNG + WebGL Spoofing (~30MB RAM)';
      badge.style.color = '#10b981';
      badge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      badge.style.background = 'rgba(16, 185, 129, 0.12)';
    } else if (isGoLogin) {
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
 * Đồng bộ cài đặt trình duyệt Obscura V8 siêu nhẹ.
 * @param {boolean} enabled
 */
function syncObscuraSetting(enabled) {
  const cbx = document.getElementById('cbxObscura');
  if (cbx && cbx.checked !== enabled) cbx.checked = enabled;
  if (enabled) {
    const cbxGoLogin = document.getElementById('cbxGoLogin');
    if (cbxGoLogin && cbxGoLogin.checked) {
      cbxGoLogin.checked = false;
      try { localStorage.setItem('autolead_use_gologin', '0'); } catch {}
    }
    if (typeof syncWindowDisplayMode === 'function') {
      syncWindowDisplayMode('runInApp', true);
    }
  }
  try {
    localStorage.setItem('autolead_use_obscura', enabled ? '1' : '0');
  } catch {}
  if (typeof syncOptionPills === 'function') {
    syncOptionPills();
  }
  updateDashboardBrowserBar();
}
window.syncObscuraSetting = syncObscuraSetting;

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
  if (enabled) {
    const cbxObscura = document.getElementById('cbxObscura');
    if (cbxObscura && cbxObscura.checked) {
      cbxObscura.checked = false;
      try { localStorage.setItem('autolead_use_obscura', '0'); } catch {}
    }
  }
  try {
    localStorage.setItem('autolead_use_gologin', enabled ? '1' : '0');
  } catch {}
  if (typeof syncOptionPills === 'function') {
    syncOptionPills();
  }
  updateDashboardBrowserBar();
}
window.syncGoLoginSetting = syncGoLoginSetting;
