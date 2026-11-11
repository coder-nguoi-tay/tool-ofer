/**
 * Handle select saved offer.
 * @return {void} Kết quả xử lý handle select saved offer.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function handleSelectSavedOffer() {
      const cbb = document.getElementById('cbbSavedOffers');
      if (!cbb || !cbb.value) return;
      const val = cbb.value;
      const found = currentSavedOffers.find((i) => i.id === val || i.NameOffer === val);
      if (found) {
        document.getElementById('txtNameOffer').value = found.NameOffer || '';
        document.getElementById('txtLinkOffer').value = found.LinkOffer || '';
        document.getElementById('txtLinkOffer2').value = found.LinkOffer2 || '';
        document.getElementById('txtLinkOffer3').value = found.LinkOffer3 || '';
        document.getElementById('txtLinkOffer4').value = found.LinkOffer4 || '';
        if (found.LinkOffer2 || found.LinkOffer3 || found.LinkOffer4) toggleExtraOfferLinks(true);
        applyOfferMethods(Array.isArray(found.methodConfigs) ? found.methodConfigs : []);
        if (found.TimeLimit) document.getElementById('txtTimeLimit').value = found.TimeLimit;
        if (found.Complete && found.Complete !== 'id') {
          document.getElementById('txtTextComplete').value = found.Complete;
        } else {
          document.getElementById('txtTextComplete').value = '';
        }
        if (found.delayStart) document.getElementById('nudDelayStart').value = found.delayStart;
        if (found.delayStop) document.getElementById('nudDelayStop').value = found.delayStop;
        if (typeof found.CheckDuplicate === 'boolean') {
          const cbxDup = document.getElementById('cbxCheckDuplicateIP');
          if (cbxDup) {
            cbxDup.checked = found.CheckDuplicate;
            try { localStorage.setItem('autoleadpc_check_duplicate', String(found.CheckDuplicate)); } catch { }
          }
        }
        if (typeof found.HideUntilLead === 'boolean') {
          const cbxHL = document.getElementById('cbxHideUntilLead');
          if (cbxHL) {
            cbxHL.checked = found.HideUntilLead;
            try { localStorage.setItem('autoleadpc_hide_until_lead', String(found.HideUntilLead)); } catch { }
          }
        }
        if (typeof found.HideUntilTarget === 'boolean') {
          const cbxHT = document.getElementById('cbxHideUntilTarget');
          if (cbxHT) {
            cbxHT.checked = found.HideUntilTarget;
            try { localStorage.setItem('autoleadpc_hide_until_target', String(found.HideUntilTarget)); } catch { }
          }
        }
        syncOptionPills();

        const statusEl = document.getElementById('offerSaveStatus');
        if (statusEl) {
          statusEl.textContent = `✓ Đã nạp: ${found.NameOffer}`;
          setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
        }
        document.getElementById('lbStatus').textContent = `Đã chọn: ${found.NameOffer}`;
      }
    }
