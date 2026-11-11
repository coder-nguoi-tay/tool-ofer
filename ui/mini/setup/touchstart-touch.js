viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        isDragging = false;
        longPressTriggered = false;

        // Long-press timer (520ms) for Right Click
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(async () => {
          if (!isDragging && currentInteractionMode === 'touch') {
            longPressTriggered = true;
            const pt = getCanvasPoint(touchStartX, touchStartY);
            if (pt) {
              const vpRect = viewport.getBoundingClientRect();
              showTouchRipple(touchStartX - vpRect.left, touchStartY - vpRect.top, true);
              await sendInput({ type: 'mousedown', x: pt.x, y: pt.y, button: 'right', clientWidth: canvasNaturalWidth, clientHeight: canvasNaturalHeight });
              setTimeout(() => {
                sendInput({ type: 'mouseup', x: pt.x, y: pt.y, button: 'right', clientWidth: canvasNaturalWidth, clientHeight: canvasNaturalHeight });
              }, 40);
              showToast('🖱️ Chuột phải (Context menu)');
            }
          }
        }, 520);

      } else if (e.touches.length === 2) {
        if (longPressTimer) clearTimeout(longPressTimer);
        isDragging = true;
        pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
        pinchStartScale = zoomScale;
      }
    }, { passive: false });
