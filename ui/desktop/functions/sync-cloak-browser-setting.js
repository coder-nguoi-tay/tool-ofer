/**
 * Sync cloak browser setting.
 * @param {*} enabled enabled.
 * @return {void} Kết quả xử lý sync cloak browser setting.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function syncCloakBrowserSetting(enabled) {
      const cbx = document.getElementById('cbxCloakBrowser');
      const chk = document.getElementById('chkUseCloakBrowser');
      if (cbx && cbx.checked !== enabled) cbx.checked = enabled;
      if (chk && chk.checked !== enabled) chk.checked = enabled;
      try {
        localStorage.setItem('autolead_use_cloakbrowser', enabled ? '1' : '0');
      } catch { }
      syncOptionPills();
    }
