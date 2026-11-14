/**
 * Ghép tên trình duyệt đang chạy phiên với phiên bản để người dùng phân biệt Chrome/GoLogin/AdsPower.
 * @param {*} ver Phiên bản do server trả (số Chrome, "Orbita", "SunBrowser ...").
 * @param {string} engine Trình duyệt chạy phiên do server xác định.
 * @return {string} Nhãn như "Chrome 150", "GoLogin Orbita", "AdsPower SunBrowser 13".
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getCleanBrowserVersion(ver, engine = 'Chrome') {
      const m = String(ver || '').match(/^(\d+)/);
      const version = m ? m[1] : String(ver || '');
      if (!version) return engine;
      return version.includes(engine) ? version : `${engine} ${version}`;
    }
