/**
 * Render saved offers dropdown.
 * @param {*} list list.
 * @param {string} selectedId selected id.
 * @return {void} Kết quả xử lý render saved offers dropdown.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderSavedOffersDropdown(list, selectedId = '') {
      const cbb = document.getElementById('cbbSavedOffers');
      if (!cbb) return;
      cbb.innerHTML = '<option value="">-- Chọn danh sách Offer đã lưu --</option>';
      for (const item of list) {
        const opt = document.createElement('option');
        opt.value = item.id || item.NameOffer;
        const linkSnippet = item.LinkOffer ? (item.LinkOffer.replace(/\n.*/s, '').slice(0, 35) + '...') : '';
        opt.textContent = `${item.NameOffer || 'Offer không tên'}${linkSnippet ? ' — ' + linkSnippet : ''}`;
        if (selectedId && (item.id === selectedId || item.NameOffer === selectedId)) {
          opt.selected = true;
        }
        cbb.appendChild(opt);
      }
    }
