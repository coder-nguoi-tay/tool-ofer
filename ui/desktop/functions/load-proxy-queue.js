/**
 * Load proxy queue.
 * @return {Promise<void>} Kết quả xử lý load proxy queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadProxyQueue() {
      const data = await api('/proxy-queue');
      if (data && !data.error) {
        const avail = data.available ?? 0;
        const used = data.used ?? 0;
        document.getElementById('lbProxyCount').textContent = avail;
        document.getElementById('lbProxyUsed').textContent = used;
        if (typeof updateQueueHealth === 'function') updateQueueHealth('proxyHealth', avail, used);
        if (data.availableList) {
          document.getElementById('txtDashboardProxy').value = data.availableList.join('\n');
        }
      }
    }
