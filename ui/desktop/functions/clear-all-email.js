/**
 * Clear all email.
 * @return {Promise<void>} Kết quả xử lý clear all email.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function clearAllEmail() {
      const res = await api('/email-queue/clear', { method: 'POST' });
      document.getElementById('txtEmailList').value = '';
      await loadEmailList();
      showWinAlert(res.message || 'Đã xóa tất cả email.');
    }
