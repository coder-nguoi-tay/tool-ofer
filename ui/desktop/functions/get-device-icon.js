/**
 * Get device icon.
 * @param {*} str str.
 * @return {*} Kết quả xử lý get device icon.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getDeviceIcon(str) {
      if (!str) return '💻';
      const s = String(str).toLowerCase();
      if (s.includes('android')) return '🤖';
      if (s.includes('iphone') || s.includes('ios')) return '📱';
      if (s.includes('ipad')) return '📲';
      if (s.includes('mac') || s.includes('darwin')) return '🍎';
      if (s.includes('win')) return '🪟';
      if (s.includes('linux')) return '🐧';
      return '💻';
    }
