/**
 * Render next frame.
 * @param {void} Không có tham số.
 * @return {void} Kết quả xử lý render next frame.
 * @throws {Error} Khi frame đang chờ không hợp lệ hoặc không thể gán nguồn ảnh.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderNextFrame() {
      if (!pendingFrame || _imgDecoding) return;
      isRendering = true;
      _imgDecoding = true;
      const { raw, screenSourceId, streamRevision } = pendingFrame;
      _streamBufferImg._screenSourceId = screenSourceId;
      _streamBufferImg._screenStreamRevision = streamRevision;
      pendingFrame = null;
      const cleanData = raw.includes('\n') ? raw.replace(/[\r\n]/g, '') : raw;
      _streamBufferImg.src = `data:image/jpeg;base64,${cleanData}`;
    }
