/**
 * New offer config.
 * @return {void} Kết quả xử lý new offer config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function newOfferConfig() {
      document.getElementById('txtNameOffer').value = '';
      document.getElementById('txtLinkOffer').value = '';
      document.getElementById('txtLinkOffer2').value = '';
      document.getElementById('txtLinkOffer3').value = '';
      document.getElementById('txtLinkOffer4').value = '';
      applyOfferMethods();
      const cbb = document.getElementById('cbbSavedOffers');
      if (cbb) cbb.value = '';
      document.getElementById('txtNameOffer').focus();
    }
