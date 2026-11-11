/**
 * Save offer config.
 * @param {boolean} silent silent.
 * @return {Promise<*>} Kết quả xử lý save offer config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveOfferConfig(silent = false) {
      const name = document.getElementById('txtNameOffer')?.value.trim() || '';
      const link1 = document.getElementById('txtLinkOffer')?.value.trim() || '';
      const link2 = document.getElementById('txtLinkOffer2')?.value.trim() || '';
      const link3 = document.getElementById('txtLinkOffer3')?.value.trim() || '';
      const link4 = document.getElementById('txtLinkOffer4')?.value.trim() || '';

      if (!link1 && !link2 && !link3 && !link4) {
        if (!silent) showWinAlert('Vui lòng nhập ít nhất Link Offer 1 trước khi bấm Lưu!');
        return;
      }

      const methodConfigs = [
        { offerNumber: 1, link: link1 || null, mode: 'auto_full', autoSubmit: true, maxPick: null, pickRandom: false, notes: '' },
        { offerNumber: 2, link: link2 || null, mode: 'auto_full', autoSubmit: true, maxPick: null, pickRandom: false, notes: '' },
        { offerNumber: 3, link: link3 || null, mode: 'auto_full', autoSubmit: true, maxPick: null, pickRandom: false, notes: '' },
        { offerNumber: 4, link: link4 || null, mode: 'auto_full', autoSubmit: true, maxPick: null, pickRandom: false, notes: '' },
      ];

      const payload = {
        NameOffer: name || (link1 ? link1.split('\n')[0].slice(0, 35) : 'Offer Mới'),
        LinkOffer: link1,
        LinkOffer2: link2,
        LinkOffer3: link3,
        LinkOffer4: link4,
        TimeLimit: document.getElementById('txtTimeLimit')?.value || '30',
        Complete: document.getElementById('txtTextComplete')?.value || '',
        delayStart: document.getElementById('nudDelayStart')?.value || '1',
        delayStop: document.getElementById('nudDelayStop')?.value || '1',
        Thread: document.getElementById('nudThread')?.value || '1',
        LimitRun: document.getElementById('nudLimitRun')?.value || '0',
        CheckDuplicate: document.getElementById('cbxCheckDuplicateIP')?.checked ?? true,
        HideUntilTarget: document.getElementById('cbxHideUntilTarget')?.checked ?? false,
        HideUntilLead: document.getElementById('cbxHideUntilLead')?.checked ?? false,
        methodConfigs: methodConfigs,
      };

      try {
        localStorage.setItem('autoleadpc_current_offer', JSON.stringify(payload));
      } catch { }

      const res = await api('/pc/offer/save', { method: 'POST', body: JSON.stringify(payload) });
      if (res && res.success) {
        if (Array.isArray(res.savedList)) {
          currentSavedOffers = res.savedList;
          renderSavedOffersDropdown(currentSavedOffers, res.savedItem?.id || payload.NameOffer);
        }
        const statusEl = document.getElementById('offerSaveStatus');
        if (statusEl) {
          statusEl.textContent = '✓ Đã lưu Offer thành công!';
          statusEl.style.display = 'inline';
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3500);
        }
        document.getElementById('lbStatus').textContent = `Đã lưu Offer: ${payload.NameOffer}`;
      } else if (!silent) {
        showWinAlert('Không thể lưu Offer: ' + (res?.error || 'Lỗi không xác định'));
      }
      return res;
    }
