// Kích hoạt/tắt refresh khi chuyển tab Log
    document.querySelectorAll('[role="tab"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tab === 'logs') startLogRefresh(); else stopLogRefresh();
      });
    });
