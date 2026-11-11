/**
 * Apply canvas transform.
 * @return {void} Kết quả xử lý apply canvas transform.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function applyCanvasTransform() {
      if (zoomScale <= 1.0) {
        zoomScale = 1.0;
        zoomPanX = 0;
        zoomPanY = 0;
        canvas.style.transform = 'none';
      } else {
        const vpRect = viewport.getBoundingClientRect();
        const maxPanX = (vpRect.width * (zoomScale - 1)) / 2;
        const maxPanY = (vpRect.height * (zoomScale - 1)) / 2;
        zoomPanX = Math.max(-maxPanX, Math.min(maxPanX, zoomPanX));
        zoomPanY = Math.max(-maxPanY, Math.min(maxPanY, zoomPanY));
        canvas.style.transform = `translate(${zoomPanX}px, ${zoomPanY}px) scale(${zoomScale})`;
      }
      const badge = document.getElementById('zoomLevelBadge');
      if (badge) badge.textContent = `${zoomScale.toFixed(1)}x`;
      if (currentInteractionMode === 'trackpad') updateVirtualCursorDisplay();
    }
