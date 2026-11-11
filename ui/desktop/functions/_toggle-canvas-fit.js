/**
 *  toggle canvas fit.
 * @return {void} Kết quả xử lý  toggle canvas fit.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _toggleCanvasFit() {
      const canvas = document.getElementById('screenCanvas');
      const btn = document.getElementById('btnToggleScreenFit');
      if (!canvas || !btn) return;
      if (_canvasFitMode === 'fit') {
        _canvasFitMode = 'actual';
        canvas.style.maxWidth = 'none';
        canvas.style.maxHeight = 'none';
        btn.textContent = '🔍 100% Gốc';
        btn.title = 'Đang hiển thị kích thước gốc (100%); nhấp để thu vừa khung';
        if (canvas.parentElement) canvas.parentElement.style.overflow = 'auto';
      } else {
        _canvasFitMode = 'fit';
        canvas.style.maxWidth = '100%';
        canvas.style.maxHeight = '100%';
        btn.textContent = '🔍 Vừa khung';
        btn.title = 'Đang thu vừa khung; nhấp để hiển thị kích thước gốc (100%)';
        if (canvas.parentElement) canvas.parentElement.style.overflow = 'hidden';
      }
    }
