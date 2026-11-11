document.getElementById('btnNewOffer').addEventListener('click', () => {
      document.getElementById('selSavedOffer').value = '';
      document.getElementById('inputOfferName').value = '';
      document.getElementById('inputWebsiteUrl').value = '';
      document.getElementById('inputWebsiteUrl2').value = '';
      document.getElementById('inputWebsiteUrl3').value = '';
      document.getElementById('inputWebsiteUrl4').value = '';
      showToast('Đã xóa trắng form Offer');
    });
