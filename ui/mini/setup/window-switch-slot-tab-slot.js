// Quản lý Tab của Slot (Multi-tab)

    window.switchSlotTab = async (slot, idx) => {
      await fetch(`/screen/tabs/${slot}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: idx }),
      });
      pollSlotTabs(slot);
    };
