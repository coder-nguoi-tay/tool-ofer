let touchScreenSourceId = '';

/**
 * Giữ mã nguồn ảnh từ khi chạm đến khi chạm xong hoặc mở menu chuột phải.
 * @param {TouchEvent} e Điểm chạm trên màn hình Mini.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
viewport.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = Date.now();
        touchScreenSourceId = canvas.dataset.screenSourceId || '';
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
              const result = await sendInput({ type: 'click', x: pt.x, y: pt.y, button: 'right',
                screenSourceId: touchScreenSourceId, clientWidth: canvasNaturalWidth, clientHeight: canvasNaturalHeight });
              if (result?.ok) showToast('🖱️ Chuột phải (Context menu)');
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
