/**
 * Gửi cú nhấp đúp của trackpad và hiển thị danh sách nếu điểm nhấn là ô chọn.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
window.executeTrackpadDblClick = async () => {
      const pt = { x: trackpadCursorX, y: trackpadCursorY };
      const vpRect = viewport.getBoundingClientRect();
      const curRect = virtualCursor.getBoundingClientRect();
      showTouchRipple(curRect.left - vpRect.left + 7, curRect.top - vpRect.top + 7);

      const target = { type: 'click', x: pt.x, y: pt.y, button: 'left', clientWidth: canvasNaturalWidth,
        clientHeight: canvasNaturalHeight, screenSourceId: canvas.dataset.screenSourceId };
      for (const clickCount of [1, 2]) {
        const result = await sendInput({ ...target, clickCount });
        if (!result?.ok) return;
        if (result.select) {
          openSelectPicker(result.select);
          return;
        }
      }
    };
