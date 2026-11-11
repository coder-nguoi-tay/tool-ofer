/**
 * Update virtual cursor display.
 * @return {void} Kết quả xử lý update virtual cursor display.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function updateVirtualCursorDisplay() {
      if (!virtualCursor || currentInteractionMode !== 'trackpad') return;
      const rect = canvas.getBoundingClientRect();
      const natW = canvasNaturalWidth || 1280;
      const natH = canvasNaturalHeight || 800;
      const canvasAspect = natW / natH;
      const elemAspect = rect.width / rect.height;

      let renderWidth, renderHeight, offsetX, offsetY;
      if (elemAspect > canvasAspect) {
        renderHeight = rect.height;
        renderWidth = rect.height * canvasAspect;
        offsetY = 0;
        offsetX = (rect.width - renderWidth) / 2;
      } else {
        renderWidth = rect.width;
        renderHeight = rect.width / canvasAspect;
        offsetX = 0;
        offsetY = (rect.height - renderHeight) / 2;
      }

      let screenX = (trackpadCursorX / natW) * renderWidth + offsetX;
      let screenY = (trackpadCursorY / natH) * renderHeight + offsetY;

      if (zoomScale > 1.0) {
        const originX = rect.width / 2;
        const originY = rect.height / 2;
        screenX = (screenX - originX) * zoomScale + originX + zoomPanX;
        screenY = (screenY - originY) * zoomScale + originY + zoomPanY;
      }

      virtualCursor.style.left = `${screenX}px`;
      virtualCursor.style.top = `${screenY}px`;
    }
