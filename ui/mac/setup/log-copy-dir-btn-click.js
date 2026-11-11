document.querySelector('#log-copy-dir-btn').addEventListener('click', () => {
      if (logStorageDir) {
        navigator.clipboard.writeText(logStorageDir).then(() => {
          status.textContent = 'Đã sao chép đường dẫn thư mục lưu HTML vào clipboard.';
        }).catch(() => {});
      }
    });
