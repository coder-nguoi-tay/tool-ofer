/**
 * Bandwidth today label.
 * @param {*} bw bw.
 * @return {*} Kết quả xử lý bandwidth today label.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function bandwidthTodayLabel(bw) {
      const today = bw?.today || {};
      if (bw?.proxy711?.ok) return today.proxy711Formatted || formatBytes(today.proxy711Bytes || 0);
      return `~${today.formatted || formatBytes(today.totalBytes || 0)}`;
    }
