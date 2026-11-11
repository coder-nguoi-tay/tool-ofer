window.executeTrackpadDblClick = async () => {
      const pt = { x: trackpadCursorX, y: trackpadCursorY };
      const vpRect = viewport.getBoundingClientRect();
      const curRect = virtualCursor.getBoundingClientRect();
      showTouchRipple(curRect.left - vpRect.left + 7, curRect.top - vpRect.top + 7);

      await sendInput({ type: 'mousedown', x: pt.x, y: pt.y, button: 'left', clickCount: 1, clientWidth: canvasNaturalWidth, clientHeight: canvasNaturalHeight });
      await sendInput({ type: 'mouseup', x: pt.x, y: pt.y, button: 'left', clickCount: 1, clientWidth: canvasNaturalWidth, clientHeight: canvasNaturalHeight });
      setTimeout(async () => {
        const res = await sendInput({ type: 'mousedown', x: pt.x, y: pt.y, button: 'left', clickCount: 2, clientWidth: canvasNaturalWidth, clientHeight: canvasNaturalHeight });
        if (res?.select && Array.isArray(res.select.options)) {
          openSelectPicker(res.select.options, res.select.selectedIndex);
        } else {
          setTimeout(() => {
            sendInput({ type: 'mouseup', x: pt.x, y: pt.y, button: 'left', clickCount: 2, clientWidth: canvasNaturalWidth, clientHeight: canvasNaturalHeight });
          }, 30);
        }
      }, 50);
    };
