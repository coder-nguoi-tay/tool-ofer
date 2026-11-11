/**
 * Pick auto refill file.
 * @param {*} input input.
 * @return {Promise<void>} Kết quả xử lý pick auto refill file.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function pickAutoRefillFile(input) {
      const file = input.files[0];
      if (!file) return;
      input.value = '';
      // Lưu đường dẫn — trong app native, file.path cho absolute path
      const path = file.path || file.name;
      document.getElementById('txtAutoRefillPath').value = path;
      await api('/email-queue/autorefill', {
        method: 'POST',
        body: JSON.stringify({
          enabled: document.getElementById('chkAutoRefill').checked,
          sourcePath: path,
          batchSize: parseInt(document.getElementById('numAutoRefillBatch').value) || 1000,
          resetCursor: true,
        }),
      });
      showWinAlert(`Đã chọn file nguồn:\n${path}`);
    }
