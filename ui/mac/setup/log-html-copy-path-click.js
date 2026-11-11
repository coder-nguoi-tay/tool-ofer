document.querySelector('#log-html-copy-path').addEventListener('click', () => {
      const pathText = document.querySelector('#log-html-filepath').textContent.replace(/^📁 File:\s*/, '');
      navigator.clipboard.writeText(pathText).then(() => {
        status.textContent = 'Đã sao chép đường dẫn file HTML vào clipboard.';
      }).catch(() => {});
    });
