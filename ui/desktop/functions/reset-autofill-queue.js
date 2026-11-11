/**
 * Reset autofill queue.
 * @return {Promise<void>} Kết quả xử lý reset autofill queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function resetAutofillQueue() {
      const res = await api('/autofill-queue/reset', { method: 'POST' });
      showWinAlert(res.message || 'Đã reset Autofill queue.');
      await loadAutofillList();
    }
