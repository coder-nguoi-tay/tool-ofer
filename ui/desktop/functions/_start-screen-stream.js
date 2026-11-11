/**
 *  start screen stream.
 * @param {number} slot slot.
 * @return {void} Kết quả xử lý  start screen stream.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function _startScreenStream(slot) {
      _stopScreenStream();
      const canvas = document.getElementById('screenCanvas');
      const ctx = canvas.getContext('2d');
      _screenFpsCounter = 0;
      let _lastFrameTime = Date.now();
      let _fpsMovingAvg = 0;
      let es = null;

      const fpsEl = document.getElementById('screenModalFps');
      if (fpsEl) {
        fpsEl.textContent = '🟢 Đang kết nối...';
        fpsEl.style.color = '#38bdf8';
      }

      if (_screenFpsTimer) clearInterval(_screenFpsTimer);
      _screenFpsTimer = setInterval(() => {
        const curFpsEl = document.getElementById('screenModalFps');
        if (!curFpsEl) return;
        if (!es || es.readyState === EventSource.CLOSED) {
          curFpsEl.textContent = '🔴 Mất kết nối (phiên đã đóng)';
          curFpsEl.style.color = '#f87171';
          return;
        }
        if (_screenFpsCounter > 0) {
          _fpsMovingAvg = _fpsMovingAvg === 0 ? _screenFpsCounter : Math.round(_fpsMovingAvg * 0.35 + _screenFpsCounter * 0.65);
          curFpsEl.textContent = `🟢 ${_fpsMovingAvg} fps`;
          curFpsEl.style.color = '#4ade80';
        } else {
          const timeSinceLastFrame = Date.now() - _lastFrameTime;
          if (es.readyState === EventSource.OPEN && timeSinceLastFrame < 10000) {
            const displayFps = Math.max(_fpsMovingAvg, 15);
            curFpsEl.textContent = `🟢 ${displayFps} fps (Ổn định)`;
            curFpsEl.style.color = '#38bdf8';
          } else {
            curFpsEl.textContent = '🟡 Đang đợi...';
            curFpsEl.style.color = '#facc15';
            _fpsMovingAvg = 0;
          }
        }
        _screenFpsCounter = 0;
      }, 1000);

      es = new EventSource(`/screen/stream/${slot}`);
      _screenEventSource = es;

      let _isRenderingFrame = false;
      let _pendingFrameData = null;
      let _streamScheduleTimeout = null;

      const _scheduleStreamFrame = (fn) => {
        let executed = false;
        const runner = () => {
          if (executed) return;
          executed = true;
          if (_streamScheduleTimeout) {
            clearTimeout(_streamScheduleTimeout);
            _streamScheduleTimeout = null;
          }
          fn();
        };

        if (typeof document !== 'undefined' && document.hidden) {
          _streamScheduleTimeout = setTimeout(runner, 0);
          return;
        }

        // Ưu tiên rAF cho mượt mà 60Hz khi cửa sổ hiển thị, kèm fallback 20ms (~50 FPS)
        // để duy trì tốc độ cao khi macOS / Chromium giảm chu kỳ compositor
        requestAnimationFrame(runner);
        _streamScheduleTimeout = setTimeout(runner, 20);
      };

      const _renderStreamFrame = async () => {
        if (!_pendingFrameData) {
          _isRenderingFrame = false;
          return;
        }
        _isRenderingFrame = true;
        const raw = _pendingFrameData;
        _pendingFrameData = null;

        try {
          const cleanData = raw.includes('\n') ? raw.replace(/[\r\n]/g, '') : raw;
          // Sử dụng fetch data URL: engine C++ native giải mã nhị phân trong nền, không tốn chu kỳ CPU JS
          const resp = await fetch(`data:image/jpeg;base64,${cleanData}`);
          const blob = await resp.blob();
          const bmp = await createImageBitmap(blob);
          if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
            canvas.width = bmp.width;
            canvas.height = bmp.height;
          }
          ctx.drawImage(bmp, 0, 0);
          bmp.close();
          _screenFpsCounter++;
          _lastFrameTime = Date.now();
        } catch (err) {
          try {
            const cleanData = raw.includes('\n') ? raw.replace(/[\r\n]/g, '') : raw;
            const img = new Image();
            img.onload = () => {
              if (canvas.width !== img.width || canvas.height !== img.height) {
                canvas.width = img.width;
                canvas.height = img.height;
              }
              ctx.drawImage(img, 0, 0);
              _screenFpsCounter++;
              _lastFrameTime = Date.now();
            };
            img.src = `data:image/jpeg;base64,${cleanData}`;
          } catch { }
        } finally {
          _isRenderingFrame = false;
          if (_pendingFrameData) {
            _scheduleStreamFrame(_renderStreamFrame);
          }
        }
      };

      es.onmessage = (e) => {
        if (!e.data || e.data === 'error') return;
        _pendingFrameData = e.data;
        if (!_isRenderingFrame) {
          _scheduleStreamFrame(_renderStreamFrame);
        }
      };

      es.onerror = () => {
        const errFpsEl = document.getElementById('screenModalFps');
        if (errFpsEl) {
          errFpsEl.textContent = '🟡 Đang kết nối lại...';
          errFpsEl.style.color = '#facc15';
        }
        if (es && es.readyState === EventSource.CLOSED && _screenActiveSlot === slot) {
          if (_screenReconnectTimer) clearTimeout(_screenReconnectTimer);
          _screenReconnectTimer = setTimeout(() => {
            if (_screenActiveSlot === slot) {
              _startScreenStream(slot);
            }
          }, 1500);
        }
      };

      // Wheel accumulator & throttle
      let _wheelAccumX = 0;
      let _wheelAccumY = 0;
      _wheelTimer = null;
      let _wheelLastX = 0;
      let _wheelLastY = 0;

      function _handleCanvasWheel(e) {
        e.preventDefault();
        let dy = e.deltaY;
        let dx = e.deltaX || 0;
        if (e.deltaMode === 1) { // DOM_DELTA_LINE (con lăn chuột thông thường)
          dy *= 35;
          dx *= 35;
        } else if (e.deltaMode === 2) { // DOM_DELTA_PAGE
          dy *= (canvas.height || 700);
          dx *= (canvas.width || 900);
        }
        _wheelAccumX += dx;
        _wheelAccumY += dy;
        _wheelLastX = _scaleX(e, canvas);
        _wheelLastY = _scaleY(e, canvas);

        if (!_wheelTimer) {
          _wheelTimer = setTimeout(() => {
            const sendDx = _wheelAccumX;
            const sendDy = _wheelAccumY;
            _wheelAccumX = 0;
            _wheelAccumY = 0;
            _wheelTimer = null;
            _sendInput(slot, {
              type: 'wheel',
              x: _wheelLastX,
              y: _wheelLastY,
              deltaX: sendDx,
              deltaY: sendDy,
              clientWidth: canvas.width,
              clientHeight: canvas.height,
              modifiers: _mods(e),
            });
          }, 25); // 25ms batching (~40fps) - mượt mà, không nghẽn mạng
        }
      }

      // Mouse move throttle
      _mouseMoveTimer = null;
      let _lastMouseMoveEvent = null;

      function _handleCanvasMouseMove(e) {
        if (!e.buttons) return;
        _lastMouseMoveEvent = e;
        if (!_mouseMoveTimer) {
          _mouseMoveTimer = setTimeout(() => {
            if (_lastMouseMoveEvent) {
              _sendInput(slot, _buildMouseEvent('mousemove', _lastMouseMoveEvent, canvas));
              _lastMouseMoveEvent = null;
            }
            _mouseMoveTimer = null;
          }, 25); // 25ms batching (~40fps) - loại bỏ nghẽn mạng do drag chuột
        }
      }

      // Input forwarding
      let pasteCatcher = document.getElementById('screenPasteCatcher');
      if (!pasteCatcher) {
        pasteCatcher = document.createElement('textarea');
        pasteCatcher.id = 'screenPasteCatcher';
        pasteCatcher.tabIndex = -1;
        pasteCatcher.setAttribute('aria-hidden', 'true');
        pasteCatcher.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
        document.body.appendChild(pasteCatcher);
      }
      canvas.onmousedown = (e) => {
        _closeSelectPicker();
        fetch(`/screen/input/${slot}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(_buildMouseEvent('mousedown', e, canvas)) })
          .then((r) => r.json())
          .then((data) => { if (data?.select) _openSelectPicker(slot, data.select, e.clientX, e.clientY); })
          .catch(() => { });
      };
      canvas.onmouseup = (e) => {
        if (_mouseMoveTimer) { clearTimeout(_mouseMoveTimer); _mouseMoveTimer = null; }
        _sendInput(slot, _buildMouseEvent('mouseup', e, canvas));
      };
      canvas.onmousemove = _handleCanvasMouseMove;
      canvas.onwheel = _handleCanvasWheel;
      canvas.onkeydown = (e) => {
        // Phím tắt hệ thống: Cmd/Ctrl + A/X/C/V → gửi shortcut để trình duyệt thực hiện copy/cut/paste/select-all
        // tự nhiên thay vì gửi phím thường (tránh double-action hoặc bị preventDefault làm mất paste).
        const isMac = navigator.platform === 'MacIntel';
        const mod = isMac ? e.metaKey : (e.ctrlKey || e.metaKey);
        const lowerKey = (e.key || '').toLowerCase();
        // Cmd/Ctrl+V: server tự đọc clipboard macOS (pbpaste) rồi gõ vào trang. WKWebView của app không phát
        // sự kiện paste trên canvas nên không lấy chữ từ trình duyệt; preventDefault để không dán hai lần.
        if (mod && lowerKey === 'v') {
          e.preventDefault();
          _sendInput(slot, { type: 'shortcut', command: 'paste', key: e.key, code: e.code, modifiers: _mods(e) });
          return;
        }
        if (mod && ['a', 'x', 'c'].includes(lowerKey)) {
          const command = lowerKey === 'a' ? 'selectAll'
            : lowerKey === 'c' ? 'copy'
              : 'cut';
          _sendInput(slot, { type: 'shortcut', command, key: e.key, code: e.code, modifiers: _mods(e) });
          return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
          e.preventDefault();
          _closeTab(slot, _screenActiveTabIndex);
          return;
        }
        e.preventDefault();
        const isPrintable = e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
        _sendInput(slot, {
          type: 'key',
          key: e.key,
          code: e.code,
          text: isPrintable ? e.key : undefined,
          modifiers: _mods(e)
        });
      };
      canvas.onkeyup = (e) => {
        const isMac = navigator.platform === 'MacIntel';
        const mod = isMac ? e.metaKey : (e.ctrlKey || e.metaKey);
        const lowerKey = (e.key || '').toLowerCase();
        if (mod && ['a', 'x', 'c', 'v'].includes(lowerKey)) {
          // Không preventDefault để paste/clipboard tự chạy xong.
          return;
        }
        e.preventDefault();
      };
      canvas.onpaste = (e) => {
        const pasteText = (e.clipboardData || window.clipboardData)?.getData('text');
        if (pasteText) {
          _sendInput(slot, { type: 'shortcut', command: 'paste', text: pasteText });
        }
      };
      pasteCatcher.onpaste = (e) => {
        e.preventDefault();
        const pasteText = (e.clipboardData || window.clipboardData)?.getData('text');
        if (pasteText) _sendInput(slot, { type: 'shortcut', command: 'paste', text: pasteText });
        canvas.focus();
      };
      canvas.tabIndex = 0;
      canvas.focus();
      _screenActiveTabIndex = 0;
      _fetchAndRenderTabs(slot);
      _screenTabPollTimer = setInterval(() => _fetchAndRenderTabs(slot), 2000);
    }
