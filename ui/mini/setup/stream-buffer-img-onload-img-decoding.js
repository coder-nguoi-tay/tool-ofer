/**
 * Vẽ ảnh đã giải mã khi tab nguồn vẫn đang được xem và mở quyền gửi thao tác tay.
 * @param {void} Không có tham số.
 * @return {void}
 * @throws {Error} Khi ảnh đã giải mã không thể vẽ lên canvas.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
_streamBufferImg.onload = () => {
      _imgDecoding = false;
      if (_streamBufferImg._screenStreamRevision !== canvas._screenStreamRevision
          || _streamBufferImg._screenSourceId !== canvas._screenStreamRevision?.screenSourceId) {
        isRendering = false;
        if (pendingFrame) _scheduleMiniRender(renderNextFrame);
        return;
      }
      // Luôn lấy kích thước frame vừa giải mã. Profile mobile/tablet có thể đổi
      // tỉ lệ hoặc tab trước còn để lại kích thước cũ trong lúc reconnect.
      canvasNaturalWidth = _streamBufferImg.naturalWidth;
      canvasNaturalHeight = _streamBufferImg.naturalHeight;
      if (canvas.width !== _streamBufferImg.naturalWidth || canvas.height !== _streamBufferImg.naturalHeight) {
        canvas.width = _streamBufferImg.naturalWidth;
        canvas.height = _streamBufferImg.naturalHeight;
      }
      ctx.drawImage(_streamBufferImg, 0, 0);
      canvas.dataset.screenSourceId = _streamBufferImg._screenSourceId || '';
      fpsCount++;
      isRendering = false;
      if (pendingFrame) _scheduleMiniRender(renderNextFrame);
    };
