document.querySelectorAll('#settingsSubTabs .sub-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const sub = tab.getAttribute('data-settingstab');
        if (sub) switchSettingsSubTab(sub);
      });
    });
