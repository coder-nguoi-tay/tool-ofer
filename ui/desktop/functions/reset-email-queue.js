/**
 * Reset email queue.
 * @return {Promise<void>} Kết quả xử lý reset email queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function resetEmailQueue() {
      await api('/email-queue/clear', { method: 'POST' });
      const text = document.getElementById('txtEmailList').value;
      const res = await api('/email-queue/import', { method: 'POST', body: JSON.stringify({ emailList: text }) });
      showWinAlert(res.message || 'Reset email list.');
      await loadEmailList();
    }
