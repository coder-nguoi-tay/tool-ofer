// Đọc danh sách Offer đã lưu

    // Quản lý Offer: Lưu / Mới / Xoá
    document.getElementById('btnSaveOffer').addEventListener('click', async () => {
      const name = document.getElementById('inputOfferName').value.trim();
      const link1 = document.getElementById('inputWebsiteUrl').value.trim();
      const link2 = document.getElementById('inputWebsiteUrl2').value.trim();
      const link3 = document.getElementById('inputWebsiteUrl3').value.trim();
      const link4 = document.getElementById('inputWebsiteUrl4').value.trim();

      if (!link1) {
        alert('Vui lòng nhập Link Offer 1!');
        return;
      }

      const payload = {
        NameOffer: name || link1.split('\n')[0].slice(0, 30),
        LinkOffer: link1,
        LinkOffer2: link2,
        LinkOffer3: link3,
        LinkOffer4: link4,
        TimeLimit: document.getElementById('inputTimeLimit').value || '30',
        Complete: document.getElementById('inputCompleteText').value || '',
        delayStart: document.getElementById('inputDelayStart').value || '1',
        delayStop: document.getElementById('inputDelayStop').value || '1',
        Thread: inputThreadCount.value || '1',
        LimitRun: document.getElementById('inputLimitRun').value || '0',
      };

      try {
        const res = await fetch('/pc/offer/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Đã lưu "${payload.NameOffer}" vào máy!`);
          await loadSavedOffers();
        } else {
          alert('Lỗi lưu: ' + (data.error || 'Không xác định'));
        }
      } catch (e) {
        alert('Lỗi kết nối: ' + e.message);
      }
    });
