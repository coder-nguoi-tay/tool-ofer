logClearBtn.addEventListener('click', () => {
      logFilterSlot.value = '';
      logFilterType.value = '';
      renderLogs();
    });
