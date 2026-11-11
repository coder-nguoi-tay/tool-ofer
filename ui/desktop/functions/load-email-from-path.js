/**
     * Nạp ngay một lô email từ path trong ô đường dẫn, cộng thêm vào hàng đợi.
     *
 * @return {Promise<void>} Kết quả xử lý load email from path.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadEmailFromPath() {
      const res = await api('/email-queue/load-from-path', {
        method: 'POST',
        body: JSON.stringify({
          sourcePath: document.getElementById('txtAutoRefillPath').value,
          batchSize: parseInt(document.getElementById('numAutoRefillBatch').value) || 1000,
        }),
      });
      showWinAlert(res.error || res.message);
      await loadEmailList();
    }
