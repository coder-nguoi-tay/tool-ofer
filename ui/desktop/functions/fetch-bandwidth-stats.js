/**
 * Fetch bandwidth stats.
 * @return {Promise<void>} Kết quả xử lý fetch bandwidth stats.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function fetchBandwidthStats() {
      try {
        const res = await api('/bandwidth/stats');
        if (!res) return;
        window.cachedBandwidthStats = res;
        renderBandwidthModal();
      } catch (err) {
        console.warn('Lỗi lấy thống kê băng thông:', err);
      }
    }
