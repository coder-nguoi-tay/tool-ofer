document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') {
        const modal = document.getElementById('bandwidthModal');
        if (modal && modal.style.display !== 'none' && modal.style.display !== '') {
          closeBandwidthModal();
        }
        const scrModal = document.getElementById('screenModal');
        if (scrModal && scrModal.style.display !== 'none' && scrModal.style.display !== '') {
          closeScreenModal();
        }
      }
    });
