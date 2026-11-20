/**
 * Xử lý kết thúc thao tác chạm, phóng to hoặc mở danh sách khi người dùng chạm vào ô chọn.
 * @param {TouchEvent} e Sự kiện kết thúc chạm.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
viewport.addEventListener('touchend', async (e) => {
      viewport._lastTouchEndedAt = Date.now();
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      if (longPressTriggered || !touchScreenSourceId || touchScreenSourceId !== canvas.dataset.screenSourceId) return;

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

            const dialogAtTap = miniTextDialog;
            const res = await sendInput({
              type: 'click',
              screenSourceId: touchScreenSourceId,
              x: pt.x,
              y: pt.y,
              button: 'left',
              clickCount: 1,
              clientWidth: canvasNaturalWidth,
              clientHeight: canvasNaturalHeight
            });

            if (dialogAtTap !== miniTextDialog) return;
            if (res?.select && Array.isArray(res.select.options)) {
              openSelectPicker(res.select);
            } else if (res?.input?.isTextLike) {
              // Chạm trúng ô gõ chữ: tự động hiện hộp thoại gõ để bàn phím điện thoại bật lên
              openTypeModal(res.input);
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
