/**
 * Save auto refill config.
 * @return {Promise<void>} Kết quả xử lý save auto refill config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveAutoRefillConfig() {
      await api('/email-queue/autorefill', {
        method: 'POST',
        body: JSON.stringify({
          enabled: document.getElementById('chkAutoRefill').checked,
          sourcePath: document.getElementById('txtAutoRefillPath').value,
          batchSize: parseInt(document.getElementById('numAutoRefillBatch').value) || 1000,
        }),
      });
    }
