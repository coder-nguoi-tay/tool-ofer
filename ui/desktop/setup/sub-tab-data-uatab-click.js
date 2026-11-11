document.querySelectorAll('.sub-tab[data-uatab]').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sub-tab[data-uatab]').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentUaTab = tab.getAttribute('data-uatab');
        loadActiveUseragent();
      });
    });
