/**
 * Save email list.
 * @return {Promise<void>} Kết quả xử lý save email list.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveEmailList() {
      const text = document.getElementById('txtEmailList').value;
      await api('/email-queue/clear', { method: 'POST' });
      const res = await api('/email-queue/import', { method: 'POST', body: JSON.stringify({ emailList: text }) });
      showWinAlert(res.message || 'Imported email list.');
      await loadEmailList();
    }
