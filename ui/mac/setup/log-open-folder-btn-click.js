document.querySelector('#log-open-folder-btn').addEventListener('click', async () => {
      const res = await fetch('/browser-logs/open-folder', { method: 'POST' }).then((r) => r.json());
      status.textContent = res.message || 'Đã mở thư mục trong Finder.';
    });
