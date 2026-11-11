_streamBufferImg.onerror = () => {
      _imgDecoding = false;
      isRendering = false;
      if (pendingFrame) _scheduleMiniRender(renderNextFrame);
    };
