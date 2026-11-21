/**
 * Mở Screen View cho một slot và chuyển thao tác trên khung hình tới tab đang xem.
 * @param {number} slot Số slot cần xem và điều khiển.
 * @return {void} Kết nối luồng ảnh và đăng ký thao tác của người dùng.
 * @throws {Error} Khi canvas hoặc kết nối stream không thể được khởi tạo.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
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
        fpsEl.textContent = '🟢 Kết nối...';
        fpsEl.title = 'Đang kết nối luồng screencast...';
        fpsEl.style.color = '#38bdf8';
      }

      if (_screenFpsTimer) clearInterval(_screenFpsTimer);
      _screenFpsTimer = setInterval(() => {
        const curFpsEl = document.getElementById('screenModalFps');
        if (!curFpsEl) return;
        if (!es || es.readyState === EventSource.CLOSED) {
          curFpsEl.textContent = '🔴 Đã ngắt';
          curFpsEl.title = 'Mất kết nối (phiên đã đóng)';
          curFpsEl.style.color = '#f87171';
          return;
        }
        if (canvas.inert) {
          curFpsEl.textContent = 'Đang chờ hình của tab…';
          return;
        }
        if (_screenFpsCounter > 0) {
          _fpsMovingAvg = _fpsMovingAvg === 0 ? _screenFpsCounter : Math.round(_fpsMovingAvg * 0.35 + _screenFpsCounter * 0.65);
          curFpsEl.textContent = `🟢 ${_fpsMovingAvg} fps`;
          curFpsEl.title = `${_fpsMovingAvg} khung hình / giây`;
          curFpsEl.style.color = '#4ade80';
        } else {
          const timeSinceLastFrame = Date.now() - _lastFrameTime;
          if (es.readyState === EventSource.OPEN && timeSinceLastFrame < 10000) {
            const displayFps = Math.max(_fpsMovingAvg, 15);
            curFpsEl.textContent = `🟢 ${displayFps} fps`;
            curFpsEl.title = `${displayFps} fps (Ổn định)`;
            curFpsEl.style.color = '#38bdf8';
          } else {
            curFpsEl.textContent = '🟡 Đang đợi...';
            curFpsEl.title = 'Đang đợi khung hình mới...';
            curFpsEl.style.color = '#facc15';
            _fpsMovingAvg = 0;
          }
        }
        _screenFpsCounter = 0;
      }, 1000);

      es = new EventSource(`/screen/stream/${slot}`);
      _screenEventSource = es;

      let sourceVersion = 0;
      // SSE báo đổi nguồn trước khi gửi ảnh từ tab mới.
      es.addEventListener?.('screen-source', () => {
        if (es !== _screenEventSource) return;
        sourceVersion++;
        delete canvas.dataset.screenSourceId;
        _closeSelectPicker();
        _pendingFrameData = null;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        canvas.inert = true;
        if (fpsEl) fpsEl.textContent = 'Đang chờ hình của tab…';
      });
      let _isRenderingFrame = false;
      let _pendingFrameData = null;
      let _streamScheduleTimeout = null;
      let latestSourceId = '';

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

      /**
       * Giải mã khung hình và bỏ ảnh tải muộn từ nguồn đã đổi tab.
       * @return {Promise<void>} Vẽ khung hình còn đúng nguồn và lên lịch cho khung hình mới nhất.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-20
       */
      const _renderStreamFrame = async () => {
        if (!_pendingFrameData) {
          _isRenderingFrame = false;
          return;
        }
        const version = sourceVersion;
        const { raw, screenSourceId } = _pendingFrameData;
        _pendingFrameData = null;

        try {
          const cleanData = raw.includes('\n') ? raw.replace(/[\r\n]/g, '') : raw;
          // Sử dụng fetch data URL: engine C++ native giải mã nhị phân trong nền, không tốn chu kỳ CPU JS
          const resp = await fetch(`data:image/jpeg;base64,${cleanData}`);
          const blob = await resp.blob();
          const bmp = await createImageBitmap(blob);
          if (version !== sourceVersion || _screenEventSource !== es || screenSourceId !== latestSourceId) { bmp.close(); return; }
          if (canvas.width !== bmp.width || canvas.height !== bmp.height) {
            canvas.width = bmp.width;
            canvas.height = bmp.height;
          }
          ctx.drawImage(bmp, 0, 0);
          canvas.inert = false;
          canvas.dataset.screenSourceId = screenSourceId;
          bmp.close();
          _screenFpsCounter++;
          _lastFrameTime = Date.now();
        } catch (err) {
          try {
            const cleanData = raw.includes('\n') ? raw.replace(/[\r\n]/g, '') : raw;
            const img = new Image();
            img.src = `data:image/jpeg;base64,${cleanData}`;
            await img.decode();
            if (version !== sourceVersion || _screenEventSource !== es || screenSourceId !== latestSourceId) return;
            if (canvas.width !== img.width || canvas.height !== img.height) {
              canvas.width = img.width;
              canvas.height = img.height;
            }
            ctx.drawImage(img, 0, 0);
            canvas.inert = false;
            canvas.dataset.screenSourceId = screenSourceId;
            _screenFpsCounter++;
            _lastFrameTime = Date.now();
          } catch { }
        } finally {
          if (_pendingFrameData && _screenEventSource === es) _scheduleStreamFrame(_renderStreamFrame);
          else _isRenderingFrame = false;
        }
      };

      /**
       * Khóa điều khiển ảnh cũ ngay khi stream báo đổi tab và giữ khung hình mới nhất để vẽ.
       * @param {MessageEvent} e Dữ liệu ảnh và mã nguồn do Screen View gửi.
       * @return {void}
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-20
       */
      es.onmessage = (e) => {
        if (!e.data || e.data === 'error') return;
        if (_screenEventSource !== es) return;
        const screenSourceId = e.lastEventId || '';
        if (screenSourceId !== latestSourceId) {
          latestSourceId = screenSourceId;
          delete canvas.dataset.screenSourceId;
          _closeSelectPicker();
        }
        _pendingFrameData = { raw: e.data, screenSourceId };
        if (!_isRenderingFrame) {
          _isRenderingFrame = true;
          _scheduleStreamFrame(_renderStreamFrame);
        }
      };

      es.onerror = () => {
        const errFpsEl = document.getElementById('screenModalFps');
        if (errFpsEl) {
          errFpsEl.textContent = '🟡 Thử lại...';
          errFpsEl.title = 'Đang kết nối lại luồng screencast...';
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
      let wheelSourceId;

      /**
       * Gom các nhịp cuộn trên cùng nguồn ảnh mà người dùng đang xem.
       * @param {WheelEvent} e Sự kiện lăn chuột trên canvas.
       * @return {void}
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-20
       */
      function _handleCanvasWheel(e) {
        e.preventDefault();
        const source = canvas.dataset.screenSourceId;
        if (!source) return;
        if (source !== wheelSourceId) {
          clearTimeout(_wheelTimer);
          _wheelTimer = null;
          _wheelAccumX = _wheelAccumY = 0;
          wheelSourceId = source;
        }
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
            if (wheelSourceId !== canvas.dataset.screenSourceId) return;
            _sendInput(slot, {
              type: 'wheel',
              screenSourceId: wheelSourceId,
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
      let pressedSourceId;

      /**
       * Giữ thao tác kéo trên nguồn ảnh nhận lần nhấn chuột ban đầu.
       * @param {MouseEvent} e Sự kiện kéo trên canvas.
       * @return {void}
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-20
       */
      function _handleCanvasMouseMove(e) {
        if (!e.buttons || !pressedSourceId || pressedSourceId !== canvas.dataset.screenSourceId) return;
        _lastMouseMoveEvent = e;
        if (!_mouseMoveTimer) {
          _mouseMoveTimer = setTimeout(() => {
            if (_lastMouseMoveEvent && pressedSourceId === canvas.dataset.screenSourceId) {
              _sendInput(slot, { ..._buildMouseEvent('mousemove', _lastMouseMoveEvent, canvas), screenSourceId: pressedSourceId });
            }
            _lastMouseMoveEvent = null;
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
      let latestMouseDown = 0;
      /**
       * Chuyển lần nhấn đến đúng tab và hiện lựa chọn điền tay cho ô vừa bấm.
       * @param {MouseEvent} e Sự kiện trên khung hình hiện tại.
       * @return {Promise<void>} Cập nhật công cụ nhập sau khi backend xác định đích.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-20
       */
      canvas.onmousedown = async (e) => {
        const source = canvas.dataset.screenSourceId;
        pressedSourceId = source;
        if (!source) return;
        const clickNumber = ++latestMouseDown;
        const tabIndex = _screenActiveTabIndex;
        const version = sourceVersion;
        _closeSelectPicker();
        const result = await api(`/screen/input/${slot}`, {
          method: 'POST', body: JSON.stringify({ ..._buildMouseEvent('mousedown', e, canvas), screenSourceId: source })
        });
        /**
         * Kiểm tra người dùng còn xem đúng lần bấm, tab và nguồn ảnh ban đầu.
         * @return {boolean} True khi có thể tiếp tục dùng thông tin ô vừa bấm.
         * @author ductv <ductv@getflycrm.com>
         * @since 2026-11-20
         */
        const isCurrentPress = () => clickNumber === latestMouseDown && es === _screenEventSource
          && tabIndex === _screenActiveTabIndex && source === canvas.dataset.screenSourceId && version === sourceVersion;
        if (!isCurrentPress()) return;
        if (result?.select) _openSelectPicker(slot, result.select, e.clientX, e.clientY);
        else if (result?.input?.fieldId && result.input.recordFields?.length) {
          const picker = document.createElement('span');
          picker.id = 'screenRecordPicker';
          const columns = document.createElement('select');
          columns.setAttribute('aria-label', 'Cột hồ sơ');
          columns.add(new Option('Chọn cột hồ sơ…', ''));
          for (const key of result.input.recordFields) columns.add(new Option(key, key));
          const insert = document.createElement('button');
          insert.type = 'button';
          insert.className = 'screen-tool-btn';
          insert.textContent = 'Chèn';
          insert.disabled = true;
          /**
           * Mở nút chèn sau khi người dùng chọn một cột có dữ liệu.
           * @return {void} Cập nhật trạng thái nút trên thanh địa chỉ.
           * @author ductv <ductv@getflycrm.com>
           * @since 2026-11-20
           */
          columns.onchange = () => { insert.disabled = !columns.value; };
          /**
           * Gửi khóa cột người dùng chọn tới đúng ô của lượt nhấn và khóa lượt gửi trùng.
           * @return {Promise<void>} Đóng công cụ sau khi chèn hoặc hiện lỗi từ form.
           * @author ductv <ductv@getflycrm.com>
           * @since 2026-11-20
           */
          insert.onclick = async () => {
            if (!picker.isConnected || !isCurrentPress() || _screenActiveSlot !== slot) { picker.remove(); return; }
            if (!columns.value || columns.disabled) return;
            columns.disabled = insert.disabled = true;
            const applied = await api(`/screen/input/${slot}`, {
              method: 'POST', body: JSON.stringify({ type: 'insertRecordField', recordField: columns.value,
                fieldId: result.input.fieldId, screenSourceId: source })
            });
            if (!picker.isConnected || !isCurrentPress() || _screenActiveSlot !== slot) return;
            if (applied?.ok) picker.remove();
            else {
              columns.disabled = insert.disabled = false;
              showToast(applied?.error || 'Chưa chèn được dữ liệu hồ sơ.', 'error');
            }
          };
          picker.append(columns, insert);
          document.querySelector('.screen-address-bar')?.appendChild(picker);
        } else if (result?.error) showToast(result.error, 'error');
      };
      canvas.onmouseup = (e) => {
        if (_mouseMoveTimer) { clearTimeout(_mouseMoveTimer); _mouseMoveTimer = null; }
        const source = pressedSourceId;
        pressedSourceId = null;
        if (source && source === canvas.dataset.screenSourceId) {
          _sendInput(slot, { ..._buildMouseEvent('mouseup', e, canvas), screenSourceId: source });
        }
      };
      canvas.onmousemove = _handleCanvasMouseMove;
      canvas.onwheel = _handleCanvasWheel;
      /**
       * Chuyển phím người dùng sang tab đang xem, đóng đúng nguồn hình khi nhấn Ctrl/Cmd+W.
       * @param {KeyboardEvent} e Phím nhấn trên canvas.
       * @return {void} Gửi thao tác điều khiển khi nguồn phù hợp.
       * @author ductv <ductv@getflycrm.com>
       * @since 2026-11-20
       */
      canvas.onkeydown = (e) => {
        if (e.key === 'Tab') document.getElementById('screenRecordPicker')?.remove();
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
          const screenSourceId = canvas.dataset.screenSourceId;
          if (screenSourceId && !e.repeat) _closeTab(slot, undefined, screenSourceId);
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
