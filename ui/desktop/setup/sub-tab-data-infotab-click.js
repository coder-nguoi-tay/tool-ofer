document.querySelectorAll('.sub-tab[data-infotab]').forEach(tab => {
      tab.addEventListener('click', () => {
        const infotab = tab.getAttribute('data-infotab');
        switchInfoSubTab(infotab);
      });
    });
