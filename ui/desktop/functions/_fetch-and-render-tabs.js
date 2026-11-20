/**
 * Hiển thị các tab của slot đang xem và đánh dấu tab cần người dùng xác minh CAPTCHA.
 * @param {number} slot Slot đang mở trong Screen View.
 * @return {Promise<void>} Hoàn tất cập nhật thanh tab.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
async function _fetchAndRenderTabs(slot) {
      try {
        const res = await fetch(`/screen/tabs/${slot}`);
        if (!res.ok) return;
        const { tabs } = await res.json();
        const bar = document.getElementById('screenTabBar');
        if (!bar || slot !== _screenActiveSlot) return;

        // Cập nhật ô địa chỉ URL
        const activeTab = tabs?.find(t => t.index === _screenActiveTabIndex) || tabs?.[0];
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
          if (isActive && tab.manualCaptchaPending && tab.manualCaptchaRequestId) {
            const confirmButton = document.createElement('button');
            confirmButton.type = 'button';
            confirmButton.className = 'win-btn win-btn-sm';
            confirmButton.textContent = 'Đã xác minh';
            confirmButton.title = 'Kiểm tra lại CAPTCHA và tiếp tục điền form trên tab đang xem';
            /**
             * Yêu cầu kiểm tra lại đúng lượt xác minh mà người dùng vừa hoàn thành.
             * @return {Promise<void>} Cập nhật danh sách tab sau khi server trả lời.
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
