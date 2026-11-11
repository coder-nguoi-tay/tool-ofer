window.closeSlotTab = async (slot, idx) => {
      await fetch(`/screen/tabs/close/${slot}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx }),
      });
      pollSlotTabs(slot);
    };
