/**
 * Get canvas point.
 * @param {*} clientX client x.
 * @param {*} clientY client y.
 * @return {*} Kết quả xử lý get canvas point.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function getCanvasPoint(clientX, clientY) {
      if (!viewport) return null;
      const vpRect = viewport.getBoundingClientRect();
      if (!vpRect.width || !vpRect.height) return null;

      const natW = canvasNaturalWidth || 1280;
      const natH = canvasNaturalHeight || 800;
      const canvasAspect = natW / natH;
      const vpAspect = vpRect.width / vpRect.height;

      let baseW, baseH, baseX, baseY;
      if (vpAspect > canvasAspect) {
        baseH = vpRect.height;
        baseW = vpRect.height * canvasAspect;
        baseX = (vpRect.width - baseW) / 2;
        baseY = 0;
      } else {
        baseW = vpRect.width;
        baseH = vpRect.width / canvasAspect;
        baseX = 0;
        baseY = (vpRect.height - baseH) / 2;
      }

      const vx = clientX - vpRect.left;
      const vy = clientY - vpRect.top;

      let unzoomedVx = vx;
      let unzoomedVy = vy;
      if (zoomScale > 1.0) {
        const origX = vpRect.width / 2;
        const origY = vpRect.height / 2;
        unzoomedVx = (vx - origX - (zoomPanX || 0)) / zoomScale + origX;
        unzoomedVy = (vy - origY - (zoomPanY || 0)) / zoomScale + origY;
      }

      const relX = unzoomedVx - baseX;
      const relY = unzoomedVy - baseY;

      const clampedX = Math.max(0, Math.min(baseW, relX));
      const clampedY = Math.max(0, Math.min(baseH, relY));

      const actualX = Math.round((clampedX / baseW) * natW);
      const actualY = Math.round((clampedY / baseH) * natH);

      return {
        x: actualX,
        y: actualY,
        inBounds: (relX >= 0 && relX <= baseW && relY >= 0 && relY <= baseH),
      };
    }
