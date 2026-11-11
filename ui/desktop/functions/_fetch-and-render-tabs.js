/**
 *  fetch and render tabs.
 * @param {number} slot slot.
 * @return {Promise<void>} Kết quả xử lý  fetch and render tabs.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function _fetchAndRenderTabs(slot) {
      try {
        const res = await fetch(`/screen/tabs/${slot}`);
        if (!res.ok) return;
        const { tabs } = await res.json();
        const bar = document.getElementById('screenTabBar');
        if (!bar) return;

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
          chip.onclick = () => _switchTab(slot, tab.index);

          const icon = document.createElement('span');
          icon.className = 'screen-tab-favicon';
          icon.textContent = '🌐';
          chip.appendChild(icon);

          const label = document.createElement('span');
          label.className = 'screen-tab-label';
          label.textContent = (tab.title || tab.url || `Tab ${tab.index + 1}`) + bwStr;
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
