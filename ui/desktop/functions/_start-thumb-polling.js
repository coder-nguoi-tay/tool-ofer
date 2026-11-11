/**
 * Cập nhật thumbnail mỗi 5 giây; ảnh ngoài vùng nhìn được bỏ qua trong từng lượt.
 * @return {void} Khởi động lịch cập nhật ảnh thu nhỏ.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function _startThumbPolling() {
      _stopThumbPolling();
      _pollThumbnails();
      _thumbPollTimer = setInterval(_pollThumbnails, 5000);
    }
