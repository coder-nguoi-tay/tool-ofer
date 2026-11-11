if (currentPort !== '3210') {
      const h1 = document.querySelector('h1');
      if (h1 && !h1.textContent.includes('Bản')) {
        const instanceNum = currentPort === '3211' ? '2' : currentPort;
        h1.textContent = `AutoLeadPC Mac (Bản ${instanceNum})`;
      }
      const eyebrow = document.querySelector('.eyebrow');
      if (eyebrow) {
        eyebrow.textContent = `Chrome proxy launcher (Cổng ${currentPort})`;
      }
      document.title = `AutoLeadPC Mac (Bản ${currentPort === '3211' ? '2' : currentPort})`;
    }
