viewport.addEventListener('touchend', async (e) => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      if (longPressTriggered) return;

      const elapsed = Date.now() - touchStartTime;

      if (!isDragging && elapsed < 500 && e.changedTouches.length === 1) {
        const changeTouch = e.changedTouches[0];
        const now = Date.now();
        const timeSinceLastTap = now - lastTapTime;
        const distFromLastTap = Math.sqrt((changeTouch.clientX - lastTapX) ** 2 + (changeTouch.clientY - lastTapY) ** 2);

        // Double-Tap to Zoom Toggle
        if (timeSinceLastTap < 300 && distFromLastTap < 28) {
          lastTapTime = 0;
          if (zoomScale <= 1.05) {
            zoomScale = 2.4;
            const vpRect = viewport.getBoundingClientRect();
            zoomPanX = (vpRect.width / 2 - changeTouch.clientX) * 1.2;
            zoomPanY = (vpRect.height / 2 - changeTouch.clientY) * 1.2;
            applyCanvasTransform();
            showToast('🔍 Phóng to 2.4x (Nhấp đúp)');
          } else {
            resetZoom();
            showToast('🔍 Vừa khung (1.0x)');
          }
          try { tg?.HapticFeedback?.impactOccurred('medium'); } catch {}
          return;
        }

        lastTapTime = now;
        lastTapX = changeTouch.clientX;
        lastTapY = changeTouch.clientY;

        if (currentInteractionMode === 'touch') {
          const pt = getCanvasPoint(changeTouch.clientX, changeTouch.clientY);
          if (pt) {
            const vpRect = viewport.getBoundingClientRect();
            showTouchRipple(changeTouch.clientX - vpRect.left, changeTouch.clientY - vpRect.top);
            try { tg?.HapticFeedback?.impactOccurred('light'); } catch {}

            // Gửi click nguyên tử đơn lượt (giảm 60% độ trễ, không bị rớt click)
            const res = await sendInput({
              type: 'click',
              x: pt.x,
              y: pt.y,
              button: 'left',
              clickCount: 1,
              clientWidth: canvasNaturalWidth,
              clientHeight: canvasNaturalHeight
            });

            if (res?.select && Array.isArray(res.select.options)) {
              openSelectPicker(res.select.options, res.select.selectedIndex);
            } else if (res?.input?.isTextLike) {
              // Chạm trúng ô gõ chữ: tự động hiện hộp thoại gõ để bàn phím điện thoại bật lên
              openTypeModalWithInput(res.input);
            }
          }
        } else if (currentInteractionMode === 'trackpad') {
          const pt = getCanvasPoint(changeTouch.clientX, changeTouch.clientY);
          if (pt) {
            trackpadCursorX = pt.x;
            trackpadCursorY = pt.y;
            updateVirtualCursorDisplay();
            executeTrackpadClick('left');
          }
        }
      }
    }, { passive: true });
