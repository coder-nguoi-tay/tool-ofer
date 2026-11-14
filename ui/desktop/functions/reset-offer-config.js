/**
 * Reset offer config.
 * @return {void} Kết quả xử lý reset offer config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function resetOfferConfig() {
      document.getElementById('txtNameOffer').value = '';
      document.getElementById('txtLinkOffer').value = '';
      document.getElementById('txtLinkOffer2').value = '';
      if (document.getElementById('txtLinkOffer3')) document.getElementById('txtLinkOffer3').value = '';
      if (document.getElementById('txtLinkOffer4')) document.getElementById('txtLinkOffer4').value = '';
      for (let i = 1; i <= 4; i++) {
        const cbx = document.getElementById(`cbxScheduleOffer${i}`);
        const timeInput = document.getElementById(`timeScheduleOffer${i}`);
        if (cbx) cbx.checked = false;
        if (timeInput) timeInput.style.display = 'none';
      }
      if (typeof cancelOfferSchedule === 'function') cancelOfferSchedule();
      applyOfferMethods();
      document.getElementById('txtTextComplete').value = '';
      const cbb = document.getElementById('cbbSavedOffers');
      if (cbb) cbb.value = '';
    }
