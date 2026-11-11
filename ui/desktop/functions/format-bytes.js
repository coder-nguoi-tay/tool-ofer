/**
 * Format bytes.
 * @param {number} bytes bytes.
 * @param {number} decimals decimals.
 * @return {*} Kết quả xử lý format bytes.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function formatBytes(bytes, decimals = 2) {
      if (!bytes || bytes <= 0 || isNaN(bytes)) return '0 B';
      const k = 1024;
      const dm = decimals < 0 ? 0 : decimals;
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      if (i <= 0) return `${Math.round(bytes)} B`;
      const val = (bytes / Math.pow(k, i)).toFixed(dm);
      return `${val} ${sizes[i]}`;
    }
