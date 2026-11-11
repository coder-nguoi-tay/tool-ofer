/**
 * Load email list.
 * @return {Promise<void>} Kết quả xử lý load email list.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadEmailList() {
      const data = await api('/email-queue');
      if (data && !data.error) {
        const avail = data.available || 0;
        const used = data.used || 0;
        if (document.getElementById('lbTotalEmail')) document.getElementById('lbTotalEmail').textContent = avail + used;
        if (document.getElementById('lbAvailEmail')) document.getElementById('lbAvailEmail').textContent = avail;
        if (document.getElementById('lbUsedEmail')) document.getElementById('lbUsedEmail').textContent = used;
        if (typeof updateQueueHealth === 'function') updateQueueHealth('emailHealth', avail, used);
        if (data.availableList) {
          document.getElementById('txtEmailList').value = data.availableList.join('\n');
        }
      }
    }
