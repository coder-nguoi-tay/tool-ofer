document.querySelectorAll('.sub-tab[data-subtab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab[data-subtab]').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('#panel-Script .sub-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`subpanel-${tab.getAttribute('data-subtab')}`)?.classList.add('active');
      });
    });
