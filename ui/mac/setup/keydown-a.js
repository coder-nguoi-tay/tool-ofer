// Hỗ trợ phím tắt Cmd+A / Ctrl+A bôi đen toàn bộ nội dung trong ô input/textarea
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key?.toLowerCase() === 'a') {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
          active.select();
        }
      }
    });
