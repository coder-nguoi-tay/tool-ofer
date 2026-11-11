document.querySelector('#log-html-copy').addEventListener('click', () => {
      navigator.clipboard.writeText(logHtmlPre.textContent).then(() => {
        status.textContent = 'Đã sao chép nội dung HTML vào clipboard.';
      }).catch(() => {});
    });
