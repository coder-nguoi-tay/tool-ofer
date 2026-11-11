/**
 * Switch tab.
 * @param {*} tabId tab id.
 * @return {void} Kết quả xử lý switch tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function switchTab(tabId) {
      if (tabId === 'Logs') {
        switchTab('Settings');
        switchSettingsSubTab('logs');
        return;
      }
      if (tabId === 'AI') {
        switchTab('Settings');
        switchSettingsSubTab('ai');
        return;
      }
      if (tabId === 'ScreenView') {
        switchTab('tabRunning');
        if (!_screenViewActive) toggleScreenView();
        return;
      }
      if (tabId === 'tabRunning') {
        if (_screenViewActive) toggleScreenView();
      } else if (_screenViewActive) {
        _stopThumbPolling();
      }

      document.querySelectorAll('#mainTabHeaders .win-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      const targetHeader = document.querySelector(`#mainTabHeaders .win-tab[data-tab="${tabId}"]`);
      const targetPanel = document.getElementById(`panel-${tabId}`);
      if (targetHeader) targetHeader.classList.add('active');
      if (targetPanel) targetPanel.classList.add('active');

      if (tabId === 'Settings') {
        void loadTelegramConfig();
        const activeSub = document.querySelector('#settingsSubTabs .sub-tab.active');
        if (activeSub && activeSub.getAttribute('data-settingstab') === 'logs') {
          startLogRefresh();
        } else {
          stopLogRefresh();
        }
      } else {
        stopLogRefresh();
      }

      if (tabId === 'ToffersLeads') {
        fetchToffersLeads(false);
      }
    }
