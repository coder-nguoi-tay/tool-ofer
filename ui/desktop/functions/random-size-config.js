/**
 * Random size config.
 * @return {void} Kết quả xử lý random size config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function randomSizeConfig() {
      const minW = parseInt(document.getElementById('nudMinWidth').value) || 1200;
      const maxW = parseInt(document.getElementById('nudMaxWidth').value) || 1440;
      const minH = parseInt(document.getElementById('nudMinHeight').value) || 700;
      const maxH = parseInt(document.getElementById('nudMaxHeight').value) || 900;
      const rw = Math.floor(Math.random() * (maxW - minW + 1)) + minW;
      const rh = Math.floor(Math.random() * (maxH - minH + 1)) + minH;
      alert(`Random Screen Size: ${rw} x ${rh}`);
    }
