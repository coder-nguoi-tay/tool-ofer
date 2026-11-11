_streamBufferImg.onload = () => {
      _imgDecoding = false;
      if (canvas.width !== _streamBufferImg.naturalWidth || canvas.height !== _streamBufferImg.naturalHeight) {
        canvas.width = _streamBufferImg.naturalWidth;
        canvas.height = _streamBufferImg.naturalHeight;
        canvasNaturalWidth = _streamBufferImg.naturalWidth;
        canvasNaturalHeight = _streamBufferImg.naturalHeight;
      }
      ctx.drawImage(_streamBufferImg, 0, 0);
      fpsCount++;
      isRendering = false;
      if (pendingFrame) _scheduleMiniRender(renderNextFrame);
    };
