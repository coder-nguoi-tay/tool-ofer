/**
 * Reset proxy queue.
 * @return {Promise<void>} Kết quả xử lý reset proxy queue.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function resetProxyQueue() {
      const res = await api('/proxy-queue/reset', {
        method: 'POST',
        body: JSON.stringify({
          proxyList: document.getElementById('txtDashboardProxy').value,
          clearAllUsedIps: true
        })
      });
      document.getElementById('lbStatus').textContent = res.message || 'Reset proxy complete.';
      await loadProxyQueue();
    }
