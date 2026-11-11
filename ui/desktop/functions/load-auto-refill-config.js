/**
 * Load auto refill config.
 * @return {Promise<void>} Kết quả xử lý load auto refill config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadAutoRefillConfig() {
      const data = await api('/email-queue/autorefill');
      if (!data || data.error) return;
      document.getElementById('chkAutoRefill').checked = !!data.enabled;
      document.getElementById('txtAutoRefillPath').value = data.sourcePath || '';
      document.getElementById('numAutoRefillBatch').value = data.batchSize || 1000;
    }
