/**
 * Get short domain.
 * @param {string} url url.
 * @return {*} Kết quả xử lý get short domain.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getShortDomain(url) {
      if (!url || typeof url !== 'string') return '';
      try {
        const u = new URL(url);
        if (u.protocol === 'about:' || u.protocol === 'chrome:') return u.href;
        return u.hostname.replace(/^www\./, '');
      } catch {
        return url.replace(/^https?:\/\//, '').split('/')[0] || '';
      }
    }
