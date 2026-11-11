/**
 * Export lead stats json.
 * @return {Promise<void>} Kết quả xử lý export lead stats json.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function exportLeadStatsJson() {
      try {
        const res = await api('/lead-stats');
        const stats = (res && res.stats) ? res.stats : (window.cachedLeadStats || {});
        const count = (res && res.count !== undefined) ? res.count : Object.keys(stats).length;
        if (count === 0 && Object.keys(stats).length === 0) {
          showWinAlert('Hiện chưa có dữ liệu IP lead nào được lưu.');
          return;
        }

        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(stats, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', dataStr);
        const dateStr = new Date().toISOString().slice(0, 10);
        downloadAnchor.setAttribute('download', `autolead-lead-ip-stats-${dateStr}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
      } catch (err) {
        console.error('Lỗi xuất dữ liệu Lead IP:', err);
        showWinAlert('Lỗi xuất dữ liệu: ' + (err.message || err));
      }
    }
