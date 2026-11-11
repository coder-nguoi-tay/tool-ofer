document.getElementById('btnDeleteOffer').addEventListener('click', async () => {
      const sel = document.getElementById('selSavedOffer');
      const chosen = savedOffers[sel.value];
      if (!chosen) {
        alert('Vui lòng chọn một Offer đã lưu trong danh sách để xoá!');
        return;
      }
      if (confirm(`Xoá Offer "${chosen.NameOffer}" khỏi máy?`)) {
        await fetch('/pc/offer/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: chosen.id, NameOffer: chosen.NameOffer }),
        });
        showToast('Đã xoá Offer');
        await loadSavedOffers();
      }
    });
