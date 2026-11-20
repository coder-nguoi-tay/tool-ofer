_streamBufferImg.onload = () => {
      _imgDecoding = false;
      // Luôn lấy kích thước frame vừa giải mã. Profile mobile/tablet có thể đổi
      // tỉ lệ hoặc tab trước còn để lại kích thước cũ trong lúc reconnect.
      canvasNaturalWidth = _streamBufferImg.naturalWidth;
      canvasNaturalHeight = _streamBufferImg.naturalHeight;
      if (canvas.width !== _streamBufferImg.naturalWidth || canvas.height !== _streamBufferImg.naturalHeight) {
        canvas.width = _streamBufferImg.naturalWidth;
        canvas.height = _streamBufferImg.naturalHeight;
      }
      ctx.drawImage(_streamBufferImg, 0, 0);
      fpsCount++;
      isRendering = false;
      if (pendingFrame) _scheduleMiniRender(renderNextFrame);
    };
