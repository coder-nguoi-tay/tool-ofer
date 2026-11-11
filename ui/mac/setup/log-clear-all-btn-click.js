document.querySelector('#log-clear-all-btn').addEventListener('click', () => {
      const confirmBar = document.querySelector('#log-clear-confirm');
      confirmBar.style.display = confirmBar.style.display === 'none' ? 'flex' : 'none';
    });
