/**
 * Get geo flag.
 * @param {*} geo geo.
 * @return {*} Kết quả xử lý get geo flag.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getGeoFlag(geo) {
      if (!geo || typeof geo !== 'string') return '🌐';
      const code = geo.trim().toUpperCase();
      if (code.length !== 2) return '🌐';
      try {
        const flag = String.fromCodePoint(...[...code].map(c => 0x1f1a5 + c.charCodeAt(0)));
        return flag || '🌐';
      } catch {
        return '🌐';
      }
    }
