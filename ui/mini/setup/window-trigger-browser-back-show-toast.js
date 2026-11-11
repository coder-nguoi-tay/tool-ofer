// Browser Navigation & Scroll Actions
    window.triggerBrowserBack = async () => {
      showToast('◀ Đang lùi trang...');
      await fetch(`/screen/back/${currentSlot}`, { method: 'POST' }).catch(() => {});
      try { tg?.HapticFeedback?.impactOccurred('light'); } catch {}
    };
