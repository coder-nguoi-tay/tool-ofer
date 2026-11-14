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
}
