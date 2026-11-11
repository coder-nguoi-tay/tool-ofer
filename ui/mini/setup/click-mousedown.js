// Desktop Mouse Click Support (Telegram Desktop / Browser)
    viewport.addEventListener('click', async (e) => {
      if (Date.now() - touchStartTime < 500) return;
      const pt = getCanvasPoint(e.clientX, e.clientY);
      if (!pt) return;
      const vpRect = viewport.getBoundingClientRect();
      showTouchRipple(e.clientX - vpRect.left, e.clientY - vpRect.top);
      const res = await sendInput({ type: 'mousedown', x: pt.x, y: pt.y, button: 'left', clickCount: 1, clientWidth: canvasNaturalWidth, clientHeight: canvasNaturalHeight });
      if (res?.select && Array.isArray(res.select.options)) {
        openSelectPicker(res.select.options, res.select.selectedIndex);
      } else {
        setTimeout(() => {
          sendInput({ type: 'mouseup', x: pt.x, y: pt.y, button: 'left', clickCount: 1, clientWidth: canvasNaturalWidth, clientHeight: canvasNaturalHeight });
        }, 30);
      }
    });
