/**
 * Hiển thị các tab của slot đang xem và đánh dấu tab cần người dùng xác minh CAPTCHA.
 * @param {number} slot Slot đang mở trong Screen View.
 * @return {Promise<void>} Hoàn tất cập nhật thanh tab.
 * @throws {Error} Khi không thể dựng thanh tab từ trạng thái trình duyệt.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function _fetchAndRenderTabs(slot) {
      const bar = document.getElementById('screenTabBar');
      if (!bar || slot !== _screenActiveSlot) return;
      const request = {};
      bar._latestTabRequest = request;
      try {
        const res = await fetch(`/screen/tabs/${slot}`);
        if (!res.ok) return;
        const { tabs } = await res.json();
        if (bar._latestTabRequest !== request || slot !== _screenActiveSlot) return;

        // Cập nhật ô địa chỉ URL
        const activeTab = tabs?.find(tab => tab.active);
        _screenActiveTabIndex = activeTab?.index ?? -1;
        const urlInput = document.getElementById('screenUrlInput');
        if (urlInput && activeTab && document.activeElement !== urlInput) {
          urlInput.value = activeTab.url || '';
        }

        // Tab không đổi thì giữ nguyên thanh tab (tránh nháy mỗi 2s).
        const tabsKey = JSON.stringify([_screenActiveTabIndex, tabs]);
        if (bar._uxRenderKey === tabsKey) return;
        bar._uxRenderKey = tabsKey;
        bar.innerHTML = '';
        if (!tabs || tabs.length === 0) return;

        tabs.forEach(tab => {
          const chip = document.createElement('div');
          const isActive = tab.index === _screenActiveTabIndex;
          chip.className = `screen-tab-chip ${isActive ? 'active' : ''}`;
          const bwStr = tab.bandwidthFormatted ? ` · 📶 ${tab.bandwidthFormatted}` : '';
          chip.title = (tab.url || `Tab ${tab.index + 1}`) + (tab.bandwidthFormatted ? `\nBăng thông: ${tab.bandwidthFormatted} (↑${formatBytes(tab.bytesSent || 0)} · ↓${formatBytes(tab.bytesReceived || 0)})` : '');
          chip.onclick = () => _switchTab(slot, tab.index, tab.manualCaptchaRequestId);

          const icon = document.createElement('span');
          icon.className = 'screen-tab-favicon';
          icon.textContent = '🌐';
          chip.appendChild(icon);

          const label = document.createElement('span');
          label.className = 'screen-tab-label';
          const tabTitle = tab.title || tab.url || `Tab ${tab.index + 1}`;
          label.textContent = (tab.manualCaptchaPending ? `Tab ${tab.index + 1} · Chờ xác minh CAPTCHA · ` : '') + tabTitle + bwStr;
          chip.appendChild(label);

          const closeBtn = document.createElement('span');
          closeBtn.className = 'screen-tab-close-btn';
          closeBtn.title = 'Đóng tab này (✕)';
          closeBtn.innerHTML = '✕';
          closeBtn.onclick = (e) => {
            e.stopPropagation();
            _closeTab(slot, tab.index);
          };
          chip.appendChild(closeBtn);

          bar.appendChild(chip);
          if (isActive && tab.manualDialog) {
            const pending = tab.manualDialog;
            const answerButton = document.createElement('button');
            answerButton.type = 'button';
            answerButton.textContent = 'Trả lời hộp thoại';
            /**
             * Gửi câu trả lời của người dùng cho đúng lượt hộp thoại đang hiển thị.
             * @param {void} Không có tham số.
             * @return {Promise<void>} Cập nhật thanh tab sau phản hồi của trình duyệt.
             * @throws {Error} Khi không thể gửi câu trả lời hoặc nạp lại danh sách tab.
             * @author ductv <ductv@getflycrm.com>
             * @since 2026-11-20
             */
            answerButton.onclick = async () => {
              answerButton.disabled = true;
              let promptText = '';
              let accept;
              if (pending.type === 'prompt') {
                promptText = window.prompt(pending.message, pending.defaultValue ?? '');
                accept = promptText !== null;
              } else accept = window.confirm(pending.message);
              try {
                const result = await api('/screen/input/' + slot, {
                  method: 'POST', body: JSON.stringify({ type: 'dialog', dialogId: pending.id, accept, promptText }),
                });
                if (slot === _screenActiveSlot && !result?.ok) showToast(result?.error || 'Chưa gửi được câu trả lời.', 'error');
              } finally {
                answerButton.disabled = false;
                if (slot === _screenActiveSlot) await _fetchAndRenderTabs(slot);
              }
            };
            bar.appendChild(answerButton);
          }
          if (isActive && tab.manualCaptchaPending && tab.manualCaptchaRequestId) {
            const confirmButton = document.createElement('button');
            confirmButton.type = 'button';
            confirmButton.className = 'win-btn win-btn-sm';
            confirmButton.textContent = 'Đã xác minh';
            confirmButton.title = 'Kiểm tra lại CAPTCHA và tiếp tục điền form trên tab đang xem';
            /**
             * Yêu cầu kiểm tra lại đúng lượt xác minh mà người dùng vừa hoàn thành.
             * @param {void} Không có tham số.
             * @return {Promise<void>} Cập nhật danh sách tab sau khi server trả lời.
             * @throws {Error} Khi không thể gửi yêu cầu xác minh hoặc nạp lại danh sách tab.
             * @author ductv <ductv@getflycrm.com>
             * @since 2026-11-20
             */
            confirmButton.onclick = async () => {
              confirmButton.disabled = true;
              const result = await api(`/screen/input/${slot}`, {
                method: 'POST',
                body: JSON.stringify({ type: 'confirmManualCaptcha', manualCaptchaRequestId: tab.manualCaptchaRequestId }),
              });
              if (slot !== _screenActiveSlot) return;
              if (!result?.ok) showToast(result?.error || 'Chưa thể kiểm tra xác minh CAPTCHA.', 'error');
              confirmButton.disabled = false;
              await _fetchAndRenderTabs(slot);
            };
            bar.appendChild(confirmButton);
          }
        });

        // Nút mở tab mới (+)
        const newBtn = document.createElement('button');
        newBtn.type = 'button';
        newBtn.className = 'screen-tab-new-btn';
        newBtn.title = 'Mở thêm tab mới';
        newBtn.textContent = '➕';
        newBtn.onclick = () => _openNewTab(slot);
        bar.appendChild(newBtn);
      } catch { }
    }
