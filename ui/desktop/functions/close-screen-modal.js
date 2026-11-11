/**
 * Đóng Screen View, hủy kết quả HTML đang chờ và ngừng stream.
 * @return {void} Kết quả xử lý close screen modal.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-12
 */
function closeScreenModal() {
      document.getElementById('screenModal').style.display = 'none';
      const htmlPanel = document.getElementById('screenHtmlPanel');
      if (htmlPanel) { htmlPanel.style.display = 'none'; htmlPanel.dataset.request = String(Number(htmlPanel.dataset.request || 0) + 1); }
      _stopScreenStream();
      _screenActiveSlot = null;
      if (_canvasFitMode === 'actual') {
        _toggleCanvasFit();
      }
    }
