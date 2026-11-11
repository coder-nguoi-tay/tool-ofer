document.getElementById('btnCloseSlot')?.addEventListener('click', async () => {
      if (!currentSlot) return;
      showToast(`🛑 Đang tắt Slot ${currentSlot}...`);
      try {
        await fetch(`/browser/close/${currentSlot}`, { method: 'POST' });
        showToast(`✓ Đã tắt Slot ${currentSlot}`);
      } catch (err) {
        showToast(`Lỗi tắt Slot ${currentSlot}: ` + err.message);
      } finally {
        await pollState();
      }
    });
