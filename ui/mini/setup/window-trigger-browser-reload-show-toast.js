window.triggerBrowserReload = async () => {
      showToast('🔄 Đang tải lại trang...');
      await fetch(`/screen/reload/${currentSlot}`, { method: 'POST' }).catch(() => {});
      try { tg?.HapticFeedback?.impactOccurred('light'); } catch {}
    };
