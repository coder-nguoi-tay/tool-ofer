window.closeSlotDirect = (slot) => {
      if (confirm(`Tắt Slot ${slot}?`)) {
        fetch(`/browser/close/${slot}`, { method: 'POST' }).then(() => pollState());
      }
    };
