/**
 * Switch settings sub tab.
 * @param {string} subTabName sub tab name.
 * @return {void} Kết quả xử lý switch settings sub tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function switchSettingsSubTab(subTabName) {
      const container = document.getElementById('settingsSubTabs');
      if (!container) return;
      container.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
      const activeTab = container.querySelector(`.sub-tab[data-settingstab="${subTabName}"]`);
      if (activeTab) activeTab.classList.add('active');

      const parent = document.getElementById('panel-Settings');
      if (parent) {
        parent.querySelectorAll(':scope > .sub-panel').forEach(p => p.classList.remove('active'));
        const target = document.getElementById(`settingpanel-${subTabName}`);
        if (target) target.classList.add('active');
      }

      if (subTabName === 'logs') {
        startLogRefresh();
      } else {
        stopLogRefresh();
      }
    }
