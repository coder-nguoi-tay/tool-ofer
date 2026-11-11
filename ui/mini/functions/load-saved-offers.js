/**
 * Load saved offers.
 * @return {Promise<void>} Kết quả xử lý load saved offers.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadSavedOffers() {
      try {
        const res = await fetch('/pc/offer/read');
        if (!res.ok) return;
        const data = await res.json();
        savedOffers = data.savedList || [];
        const sel = document.getElementById('selSavedOffer');
        sel.innerHTML = '<option value="">-- Chọn Offer mẫu đã lưu --</option>';
        savedOffers.forEach((o, idx) => {
          const opt = document.createElement('option');
          opt.value = idx;
          opt.textContent = `${o.NameOffer || 'Offer #' + (idx + 1)} (${(o.LinkOffer || '').slice(0, 30)}...)`;
          sel.appendChild(opt);
        });

        sel.addEventListener('change', () => {
          const chosen = savedOffers[sel.value];
          if (chosen) {
            document.getElementById('inputOfferName').value = chosen.NameOffer || '';
            document.getElementById('inputWebsiteUrl').value = chosen.LinkOffer || '';
            document.getElementById('inputWebsiteUrl2').value = chosen.LinkOffer2 || '';
            document.getElementById('inputWebsiteUrl3').value = chosen.LinkOffer3 || '';
            document.getElementById('inputWebsiteUrl4').value = chosen.LinkOffer4 || '';

            if (chosen.LinkOffer2 || chosen.LinkOffer3 || chosen.LinkOffer4) {
              document.getElementById('detailsMultiLinks').open = true;
            }

            if (chosen.Thread) {
              inputThreadCount.value = chosen.Thread;
              document.querySelectorAll('#threadsPills .pill-btn').forEach((b) => {
                b.classList.toggle('active', b.dataset.thread === chosen.Thread);
              });
            }
            if (chosen.LimitRun !== undefined) {
              document.getElementById('inputLimitRun').value = chosen.LimitRun;
            }
            if (chosen.TimeLimit) {
              document.getElementById('inputTimeLimit').value = chosen.TimeLimit;
            }
            if (chosen.Complete) {
              document.getElementById('inputCompleteText').value = chosen.Complete;
            }
            if (chosen.delayStart) {
              document.getElementById('inputDelayStart').value = chosen.delayStart;
            }
            if (chosen.delayStop) {
              document.getElementById('inputDelayStop').value = chosen.delayStop;
            }
            showToast(`Đã chọn: ${chosen.NameOffer}`);
          }
        });
      } catch (err) {}
    }
