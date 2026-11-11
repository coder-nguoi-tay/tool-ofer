/**
 * Switch711 auth mode.
 * @param {*} mode mode.
 * @return {void} Kết quả xử lý switch711 auth mode.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function switch711AuthMode(mode) {
      const secSub = document.getElementById('sec711Subuser');
      const secApi = document.getElementById('sec711Api');
      const isSub = mode === 'subuser';
      if (secSub) secSub.style.display = isSub ? 'block' : 'none';
      if (secApi) secApi.style.display = isSub ? 'none' : 'block';
      void api('/711proxy/config', {
        method: 'POST',
        body: JSON.stringify({ authMode: mode }),
      });
    }
