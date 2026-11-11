// Zoom & Pan Engine

    window.zoomIn = () => {
      zoomScale = Math.min(4.0, Number((zoomScale + 0.5).toFixed(1)));
      applyCanvasTransform();
      try { tg?.HapticFeedback?.selectionChanged(); } catch {}
    };
