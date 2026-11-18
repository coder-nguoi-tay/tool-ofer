/**
 * Áp dụng một link offer từ danh sách Toffers vào ô Cấu hình Offer của phần mềm.
 *
 * @param {string} offerId ID của offer cần nạp.
 * @param {boolean} [useTrackingLink=false] Nếu true thì dùng Link Click (tracking), mặc định dùng Link Lead.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
function useToffersOffer(offerId, useTrackingLink = false) {
  const list = window.currentToffersOffersList || [];
  const found = list.find((item) => String(item.id) === String(offerId));
  if (!found) {
    showToast('⚠️ Không tìm thấy thông tin offer #' + offerId);
    return;
  }

  const url = useTrackingLink ? (found.linkClick || found.linkLead) : (found.linkLead || found.linkClick);
  if (!url) {
    showToast('⚠️ Offer #' + offerId + ' không có link khả dụng');
    return;
  }

  const linkEl = document.getElementById('txtLinkOffer');
  const nameEl = document.getElementById('txtNameOffer');

  if (linkEl) linkEl.value = url;
  if (nameEl) {
    const geoStr = Array.isArray(found.geo) && found.geo.length ? `|${found.geo.join(',')}` : '';
    nameEl.value = `${found.name || 'offer'}_${found.id}${geoStr}`;
  }

  showToast(`⚡ Đã nạp link Offer #${found.id} vào form chạy!`);
  switchTab('Dashboard');
}

/**
 * Nạp toàn bộ các link offer trong trang hiện tại vào ô Link Offer (mỗi dòng 1 link) để chạy luân phiên.
 */
function useAllToffersOffers() {
  const list = window.currentToffersOffersList || [];
  const urls = list
    .map((item) => (item.linkLead || item.linkClick || '').trim())
    .filter(Boolean);

  if (urls.length === 0) {
    showToast('⚠️ Không có link offer nào trong trang này');
    return;
  }

  const linkEl = document.getElementById('txtLinkOffer');
  const nameEl = document.getElementById('txtNameOffer');

  if (linkEl) linkEl.value = urls.join('\n');
  if (nameEl) {
    nameEl.value = `Toffers_${window.currentToffersType || 'offers'}_${urls.length}links`;
  }

  showToast(`⚡ Đã nạp ${urls.length} link offer vào chạy luân phiên!`);
  switchTab('Dashboard');
}

/**
 * Sao chép toàn bộ link offer trong danh sách trang hiện tại vào bộ nhớ tạm (mỗi dòng 1 link).
 */
function copyAllToffersLinks() {
  const list = window.currentToffersOffersList || [];
  const urls = list
    .map((item) => (item.linkLead || item.linkClick || '').trim())
    .filter(Boolean);

  if (urls.length === 0) {
    showToast('⚠️ Không có link nào để sao chép');
    return;
  }

  const content = urls.join('\n');
  if (typeof copyToClipboard === 'function') {
    copyToClipboard(content, `📋 Đã sao chép ${urls.length} link offer!`);
  } else {
    navigator.clipboard?.writeText(content).then(() => {
      showToast(`📋 Đã sao chép ${urls.length} link offer!`);
    }).catch(() => {
      showToast('⚠️ Không thể sao chép');
    });
  }
}

/**
 * Lưu trực tiếp một offer từ Toffers vào danh sách Saved Offers.
 *
 * @param {string} offerId ID của offer.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-18
 */
async function saveToffersOfferToSaved(offerId) {
  const list = window.currentToffersOffersList || [];
  const found = list.find((item) => String(item.id) === String(offerId));
  if (!found) {
    showToast('⚠️ Không tìm thấy offer #' + offerId);
    return;
  }

  const url = found.linkLead || found.linkClick || '';
  if (!url) {
    showToast('⚠️ Offer không có link khả dụng');
    return;
  }

  const geoStr = Array.isArray(found.geo) && found.geo.length ? `|${found.geo.join(',')}` : '';
  const offerName = `${found.name || 'offer'}_${found.id}${geoStr}`;

  const offerPayload = {
    NameOffer: offerName,
    LinkOffer: url,
    LinkOffer2: '',
    LinkOffer3: '',
    LinkOffer4: '',
    MaxRunMinutes: 10,
    Complete: '',
    delayStart: 1,
    delayStop: 1,
    CheckDuplicate: true,
    HideUntilLead: false,
    HideUntilTarget: false,
    offerSolver: 'auto'
  };

  try {
    const res = await api('/pc/offer/save', {
      method: 'POST',
      body: JSON.stringify(offerPayload)
    });
    if (res && res.status === 'success') {
      showToast(`✓ Đã lưu Offer #${found.id} vào danh sách đã lưu!`);
      if (typeof loadSavedOffers === 'function') {
        void loadSavedOffers();
      }
    } else {
      showToast('Lỗi lưu offer: ' + (res?.message || 'Không rõ lỗi'));
    }
  } catch (err) {
    showToast('Lỗi lưu offer: ' + err.message);
  }
}

/**
 * Sao chép nhanh đường dẫn offer vào clipboard.
 *
 * @param {string} text Đường link cần sao chép.
 * @param {string} [label='link'] Nhãn mô tả.
 */
function copyToffersLink(text, label = 'link') {
  if (!text) {
    showToast('⚠️ Link trống, không thể sao chép');
    return;
  }
  if (typeof copyToClipboard === 'function') {
    copyToClipboard(text, `📋 Đã sao chép ${label}!`);
  } else {
    navigator.clipboard?.writeText(text).then(() => {
      showToast(`📋 Đã sao chép ${label}!`);
    }).catch(() => {
      showToast('⚠️ Không thể sao chép vào bộ nhớ tạm');
    });
  }
}
