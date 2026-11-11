/**
 * Close single browser.
 * @param {number} slot slot.
 * @return {Promise<void>} Kết quả xử lý close single browser.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function closeSingleBrowser(slot) {
      document.getElementById('lbStatus').textContent = `Đang tắt trình duyệt Slot ${slot}...`;
      const res = await api(`/browser/close/${slot}`, { method: 'POST' }).catch((err) => ({ error: err.message }));
      document.getElementById('lbStatus').textContent = res?.error ? `Lỗi tắt Slot ${slot}: ${res.error}` : `✓ Đã tắt trình duyệt Slot ${slot}.`;
      fetchRunningState();
    }
