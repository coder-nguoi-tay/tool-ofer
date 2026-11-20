// Chuẩn hoá toạ độ điểm chạm (Chống lệch Letterbox & Zoom/Pan)

    // Cập nhật vị trí con trỏ chuột ảo trên viewport

/**
 * Nhấn tại vị trí con trỏ trackpad trong Screen View và mở danh sách khi nhấn ô chọn.
 * @param {string} [button] Nút chuột được nhấn.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
    window.executeTrackpadClick = async (button = 'left') => {
      const pt = { x: trackpadCursorX, y: trackpadCursorY };
      const vpRect = viewport.getBoundingClientRect();
      const curRect = virtualCursor.getBoundingClientRect();
      showTouchRipple(curRect.left - vpRect.left + 7, curRect.top - vpRect.top + 7, button === 'right');

      const res = await sendInput({ type: 'mousedown', x: pt.x, y: pt.y, button, clientWidth: canvasNaturalWidth, clientHeight: canvasNaturalHeight });
      if (res?.select && Array.isArray(res.select.options)) {
        openSelectPicker(res.select);
      } else {
        setTimeout(() => {
          sendInput({ type: 'mouseup', x: pt.x, y: pt.y, button, clientWidth: canvasNaturalWidth, clientHeight: canvasNaturalHeight });
        }, 30);
      }
    };
