viewport.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        const currentX = e.touches[0].clientX;
        const currentY = e.touches[0].clientY;
        const deltaX = touchStartX - currentX;
        const deltaY = touchStartY - currentY;
        const dist = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

        if (dist > 26) {
          isDragging = true;
          if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
        }

        if (isDragging) {
          if (currentInteractionMode === 'trackpad') {
            // Move virtual cursor
            const natW = canvasNaturalWidth || 1280;
            const natH = canvasNaturalHeight || 800;
            const moveSpeed = 1.6 / zoomScale;
            trackpadCursorX = Math.max(0, Math.min(natW, trackpadCursorX - deltaX * moveSpeed));
            trackpadCursorY = Math.max(0, Math.min(natH, trackpadCursorY - deltaY * moveSpeed));
            updateVirtualCursorDisplay();
            touchStartX = currentX;
            touchStartY = currentY;
            e.preventDefault();
            return;
          }

          if (zoomScale > 1.05) {
            // Pan zoomed canvas locally (mượt mà GPU 60 FPS, không gửi HTTP)
            zoomPanX -= deltaX;
            zoomPanY -= deltaY;
            applyCanvasTransform();
            touchStartX = currentX;
            touchStartY = currentY;
            e.preventDefault();
            return;
          }

          // Cuộn mượt có kiểm soát nhịp gửi (chống ngập mạng làm giật màn hình)
          pendingWheelDeltaX += deltaX;
          pendingWheelDeltaY += deltaY;
          touchStartX = currentX;
          touchStartY = currentY;

          const now = Date.now();
          if (!isWheelInFlight && (now - lastWheelTime > 80)) {
            lastWheelTime = now;
            const toSendX = pendingWheelDeltaX;
            const toSendY = pendingWheelDeltaY;
            pendingWheelDeltaX = 0;
            pendingWheelDeltaY = 0;
            isWheelInFlight = true;

            const scrollMult = currentInteractionMode === 'scroll' ? 2.5 : 1.8;
            sendInput({
              type: 'wheel',
              x: (canvasNaturalWidth || 1280) / 2,
              y: (canvasNaturalHeight || 800) / 2,
              deltaX: toSendX * scrollMult,
              deltaY: toSendY * scrollMult,
              clientWidth: canvasNaturalWidth,
              clientHeight: canvasNaturalHeight,
            }).finally(() => {
              isWheelInFlight = false;
            });
          }
          e.preventDefault();
        }

      } else if (e.touches.length === 2) {
        // Pinch-to-zoom
        e.preventDefault();
        const dist = getTouchDist(e.touches[0], e.touches[1]);
        if (pinchStartDist > 0) {
          const ratio = dist / pinchStartDist;
          zoomScale = Math.max(1.0, Math.min(4.0, pinchStartScale * ratio));
          applyCanvasTransform();
        }
      }
    }, { passive: false });
