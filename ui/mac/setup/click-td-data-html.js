// Mở modal HTML khi click ô có [xem HTML]
    logTbody.addEventListener('click', (e) => {
      const td = e.target.closest('td[data-html]');
      if (!td) return;
      logHtmlTitle.textContent = td.dataset.title ?? '';
      logHtmlPre.textContent = td.dataset.html ?? '';
      const fileBar = document.querySelector('#log-html-file-bar');
      const filePathEl = document.querySelector('#log-html-filepath');
      if (td.dataset.filepath) {
        filePathEl.textContent = `📁 File: ${td.dataset.filepath}`;
        fileBar.hidden = false;
      } else {
        fileBar.hidden = true;
      }
      logHtmlModal.classList.add('open');
    });
