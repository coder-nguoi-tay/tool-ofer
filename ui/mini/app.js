// Auto refresh snapshot thumbnails in grid mode and active list every 2 seconds
    setInterval(() => {
      const thumbs = document.querySelectorAll('.ip-screen-thumb[data-slot]');
      if (!thumbs.length) return;
      thumbs.forEach((img) => {
        if (img._uxLoading) return;
        img._uxLoading = true;
        const slot = img.dataset.slot;
        const next = new Image();
        next.onload = () => { img.src = next.src; img.style.opacity = '1'; img._uxLoading = false; };
        next.onerror = () => { img._uxLoading = false; };
        next.src = `/screen/snapshot/${slot}?t=${Date.now()}`;
      });
    }, 2000);
