/**
 * Start stream.
 * @param {number} slot slot.
 * @return {void} Kết quả xử lý start stream.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function startStream(slot) {
      currentSlot = slot;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (eventSource) {
        try { eventSource.close(); } catch {}
        eventSource = null;
      }

      // Pre-load snapshot ngay lập tức để canvas có hình 0ms
      const preImg = new Image();
      preImg.onload = () => {
        if (!isRendering) {
          if (canvas.width !== preImg.width || canvas.height !== preImg.height) {
            canvas.width = preImg.width;
            canvas.height = preImg.height;
            canvasNaturalWidth = preImg.width;
            canvasNaturalHeight = preImg.height;
          }
          ctx.drawImage(preImg, 0, 0);
          canvasMsg.style.display = 'none';
        }
      };
      preImg.src = `/screen/snapshot/${slot}?t=${Date.now()}`;

      canvasMsg.style.display = 'flex';
      canvasMsg.innerHTML = `<span>🟢 Đang kết nối Slot ${slot}...</span>`;
      urlDisplay.textContent = 'Đang tải stream...';

      const cur = activeSessions.find(s => s.slot === slot);
      if (cur) {
        urlDisplay.textContent = cur.websiteUrl || cur.tabs?.[0]?.url || 'Đang mở trang...';
        ipDisplay.textContent = `IP: ${cur.exitIp || 'Local'}`;
      }

      const streamUrl = `/screen/stream/${slot}?t=${Date.now()}`;
      eventSource = new EventSource(streamUrl);

      eventSource.onmessage = (event) => {
        if (!event.data || event.data === 'error') return;
        let frameData = event.data;
        if (frameData.startsWith('{')) {
          try {
            const parsed = JSON.parse(frameData);
            if (parsed.frame) frameData = parsed.frame;
            if (parsed.metadata) {
              if (parsed.metadata.deviceWidth) canvasNaturalWidth = parsed.metadata.deviceWidth;
              if (parsed.metadata.deviceHeight) canvasNaturalHeight = parsed.metadata.deviceHeight;
            }
          } catch {}
        }
        canvasMsg.style.display = 'none';
        pendingFrame = frameData;
        if (!isRendering) _scheduleMiniRender(renderNextFrame);
      };

      eventSource.onerror = () => {
        if (canvas.width <= 300) {
          canvasMsg.style.display = 'flex';
          canvasMsg.innerHTML = `<span>⚠️ Đang kết nối lại Slot ${slot}...</span>`;
        }
        if (eventSource && eventSource.readyState === EventSource.CLOSED && currentSlot === slot && screenViewMode === 'single') {
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => {
            if (currentSlot === slot && screenViewMode === 'single') {
              startStream(slot);
            }
          }, 1500);
        }
      };

      const btnClose = document.getElementById('btnCloseSlot');
      if (btnClose) btnClose.textContent = `🛑 Tắt S${slot}`;

      renderSlotPills();
      pollSlotTabs(slot);
      updateSmartAutofillChips();
      resetZoom();
      if (currentInteractionMode === 'trackpad') updateVirtualCursorDisplay();
    }
