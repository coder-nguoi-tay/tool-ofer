/**
 * Delete saved offer.
 * @return {Promise<void>} Kết quả xử lý delete saved offer.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function deleteSavedOffer() {
      const cbb = document.getElementById('cbbSavedOffers');
      if (!cbb || !cbb.value) {
        showWinAlert('Vui lòng chọn một Offer trong danh sách để xoá!');
        return;
      }
      const val = cbb.value;
      const found = currentSavedOffers.find((i) => i.id === val || i.NameOffer === val);
      if (!found) return;

      if (!confirm(`Bạn có chắc chắn muốn xoá "${found.NameOffer}" khỏi danh sách lưu?`)) {
        return;
      }

      const res = await api('/pc/offer/delete', {
        method: 'POST',
        body: JSON.stringify({ id: found.id, NameOffer: found.NameOffer }),
      });
      if (res && res.success) {
        currentSavedOffers = res.savedList || [];
        renderSavedOffersDropdown(currentSavedOffers);
        resetOfferConfig();
        document.getElementById('lbStatus').textContent = `Đã xoá Offer: ${found.NameOffer}`;
      }
    }
