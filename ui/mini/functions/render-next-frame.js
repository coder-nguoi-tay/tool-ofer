/**
 * Render next frame.
 * @return {void} Kết quả xử lý render next frame.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderNextFrame() {
      if (!pendingFrame || _imgDecoding) return;
      isRendering = true;
      _imgDecoding = true;
      const raw = pendingFrame;
      pendingFrame = null;
      const cleanData = raw.includes('\n') ? raw.replace(/[\r\n]/g, '') : raw;
      _streamBufferImg.src = `data:image/jpeg;base64,${cleanData}`;
    }
