// Đọc URL query param nếu có slot cụ thể (VD: /screen-mini?slot=2)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const initialSlot = parseInt(urlParams.get('slot'), 10);
      if (initialSlot) {
        currentSlot = initialSlot;
        screenViewMode = 'single';
      }
    } catch {}
