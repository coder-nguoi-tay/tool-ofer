tabButtons.forEach((tabButton) => {
      tabButton.addEventListener('click', () => activateTab(tabButton.dataset.tab));
      tabButton.addEventListener('keydown', (event) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const currentIndex = tabButtons.indexOf(tabButton);
        const nextIndex = event.key === 'Home' ? 0
          : event.key === 'End' ? tabButtons.length - 1
            : (currentIndex + (event.key === 'ArrowRight' ? 1 : tabButtons.length - 1)) % tabButtons.length;
        const nextTab = tabButtons[nextIndex];
        activateTab(nextTab.dataset.tab);
        nextTab.focus();
      });
    });
