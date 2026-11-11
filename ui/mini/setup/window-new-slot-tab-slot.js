window.newSlotTab = async (slot) => {
      await fetch(`/screen/tabs/new/${slot}`, { method: 'POST' });
      showToast('Đã mở tab mới');
      pollSlotTabs(slot);
    };
