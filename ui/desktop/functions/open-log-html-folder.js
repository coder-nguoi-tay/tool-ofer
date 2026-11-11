/**
 * Open log html folder.
 * @return {Promise<void>} Kết quả xử lý open log html folder.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function openLogHtmlFolder() {
      const body = currentSelectedOfferLogTab && currentSelectedOfferLogTab !== 'all'
        ? { offer: currentSelectedOfferLogTab }
        : {};
      const res = await api('/browser-logs/open-folder', { method: 'POST', body: JSON.stringify(body) });
      document.getElementById('lbStatus').textContent = res.message || 'Đã mở thư mục HTML trong Finder.';
    }
