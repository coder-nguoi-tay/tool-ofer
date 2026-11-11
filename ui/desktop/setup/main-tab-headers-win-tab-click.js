document.querySelectorAll('#mainTabHeaders .win-tab').forEach(tab => {
      tab.addEventListener('click', () => switchTab(tab.getAttribute('data-tab')));
    });
