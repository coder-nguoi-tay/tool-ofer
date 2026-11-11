window.zoomOut = () => {
      zoomScale = Math.max(1.0, Number((zoomScale - 0.5).toFixed(1)));
      applyCanvasTransform();
      try { tg?.HapticFeedback?.selectionChanged(); } catch {}
    };
