/**
 * Get clean browser version.
 * @param {*} ver ver.
 * @return {*} Kết quả xử lý get clean browser version.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getCleanBrowserVersion(ver) {
      if (!ver) return 'Chrome';
      const m = String(ver).match(/^(\d+)/);
      if (m) return `Chrome ${m[1]}`;
      return String(ver);
    }
