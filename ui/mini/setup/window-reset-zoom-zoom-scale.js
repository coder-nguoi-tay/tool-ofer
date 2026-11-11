window.resetZoom = () => {
      zoomScale = 1.0;
      zoomPanX = 0;
      zoomPanY = 0;
      applyCanvasTransform();
      try { tg?.HapticFeedback?.selectionChanged(); } catch {}
    };
