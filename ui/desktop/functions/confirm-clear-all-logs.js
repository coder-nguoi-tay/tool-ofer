/**
 * Confirm clear all logs.
 * @return {Promise<void>} Kết quả xử lý confirm clear all logs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function confirmClearAllLogs() {
      cancelClearAllLogs();
      const body = currentSelectedOfferLogTab && currentSelectedOfferLogTab !== 'all'
        ? { offer: currentSelectedOfferLogTab }
        : {};
      const res = await api('/browser-logs/clear', { method: 'POST', body: JSON.stringify(body) });
      document.getElementById('lbStatus').textContent = res.message || 'Đã xoá toàn bộ log & file HTML.';
      await fetchLogs();
    }
