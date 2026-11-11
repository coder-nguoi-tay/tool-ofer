/**
 * Đồng bộ các ô trình duyệt và chỉ tải thumbnail đang nằm trong vùng nhìn của người dùng.
 * @return {void} Cập nhật thông tin và lên lịch tải ảnh có giới hạn.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-11
 */
function _pollThumbnails() {
      if (!_screenViewActive || document.hidden) return;
      const tilesDiv = document.getElementById('thumbnailTiles');
      const emptyDiv = document.getElementById('thumbnailEmpty');

      const filteredSlots = currentSelectedRunningOfferTab === 'all'
        ? _screenSlots
        : _screenSlots.filter(s => String(s.offerNumber || 1) === currentSelectedRunningOfferTab);

      if (filteredSlots.length === 0) {
        tilesDiv.innerHTML = '';
        emptyDiv.style.display = 'block';
        emptyDiv.textContent = currentSelectedRunningOfferTab === 'all'
          ? 'Không có luồng trình duyệt nào đang chạy.'
          : `Không có luồng nào đang chạy cho Offer ${currentSelectedRunningOfferTab}.`;
        return;
      }
      emptyDiv.style.display = 'none';

      // Sync tiles: thêm mới / xoá cũ
      const existingSlots = new Set([...tilesDiv.querySelectorAll('[data-slot]')].map(el => +el.dataset.slot));
      const currentSlotIds = new Set(filteredSlots.map(s => s.slot));
      for (const slot of existingSlots) {
        if (!currentSlotIds.has(slot)) tilesDiv.querySelector(`[data-slot="${slot}"]`)?.remove();
      }

      for (let tileIdx = 0; tileIdx < filteredSlots.length; tileIdx++) {
        const entry = filteredSlots[tileIdx];
        const { slot, ip, leadCheckStatus, leadObserveStatus, completedScreens, pageJumps, offerNumber, currentAction, isWindowVisible } = entry;
        let tile = tilesDiv.querySelector(`[data-slot="${slot}"]`);
        const devIcon = getDeviceIcon(entry.deviceVersion || entry.deviceProfile);
        const devClean = getCleanDeviceName(entry);
        const browserClean = getCleanBrowserVersion(entry.version);
        const domainShort = getShortDomain(entry.websiteUrl) || (ip ? `proxy: ${ip}` : 'connecting...');

        if (!tile) {
          tile = document.createElement('div');
          tile.dataset.slot = slot;
          tile.className = 'screen-tile-card';
          tile.onclick = () => openScreenModal(slot);

          tile.innerHTML = `
            <div class="screen-tile-header">
              <div class="screen-tile-header-left">
                <span class="screen-tile-slot-badge">Slot ${slot}</span>
                <span class="screen-tile-device-info" title="${escHtml(entry.deviceSummary || entry.deviceVersion || entry.deviceProfile || '')}">
                  <span class="device-icon">${devIcon}</span>
                  <span class="device-name">${escHtml(devClean)}</span>
                  <span class="browser-badge">${escHtml(browserClean)}</span>
                </span>
              </div>
              <div class="screen-tile-actions">
                <button type="button" class="btn-tile-desktop ${isWindowVisible ? 'is-visible' : ''}" onclick="event.stopPropagation(); toggleBrowserWindow(${slot}, ${Boolean(isWindowVisible)});" title="${isWindowVisible ? 'Thu nhỏ cửa sổ về chạy ngầm' : 'Bung cửa sổ ra Desktop'}">
                  ${isWindowVisible ? '🔽 Ẩn' : '🖥️ Desktop'}
                </button>
                <button type="button" class="btn-tile-close" onclick="event.stopPropagation(); closeSingleBrowser(${slot});" title="Đóng trình duyệt Slot ${slot}">✕</button>
                <span class="screen-tile-live-badge"><span class="screen-tile-live-dot"></span> LIVE</span>
              </div>
            </div>
            <div class="screen-tile-preview-wrap">
              <div class="screen-tile-browser-bar">
                <div class="screen-tile-traffic-dots">
                  <span class="mock-dot red"></span>
                  <span class="mock-dot yellow"></span>
                  <span class="mock-dot green"></span>
                </div>
                <div class="screen-tile-url-pill" title="${escHtml(entry.websiteUrl || '')}">
                  <span class="lock-icon">🔒</span>
                  <span class="url-text">${escHtml(domainShort)}</span>
                </div>
              </div>
              <div class="screen-tile-img-container">
                <img alt="Slot ${slot}" />
                <div class="screen-tile-hover-overlay">
                  <span class="hover-action-pill">🔍 Mở tương tác full</span>
                </div>
              </div>
            </div>
            <div class="screen-tile-footer"></div>
          `;
          tilesDiv.appendChild(tile);
        }

        // Cập nhật nút Desktop
        const btnDesktop = tile.querySelector('.btn-tile-desktop');
        if (btnDesktop) {
          btnDesktop.textContent = isWindowVisible ? '🔽 Ẩn' : '🖥️ Desktop';
          btnDesktop.title = isWindowVisible ? 'Thu nhỏ cửa sổ về chạy ngầm' : 'Bung cửa sổ ra Desktop';
          btnDesktop.classList.toggle('is-visible', Boolean(isWindowVisible));
          btnDesktop.onclick = (e) => { e.stopPropagation(); toggleBrowserWindow(slot, Boolean(isWindowVisible)); };
        }

        // Cập nhật Domain / URL
        const urlTextEl = tile.querySelector('.screen-tile-url-pill .url-text');
        if (urlTextEl && urlTextEl.textContent !== domainShort) {
          urlTextEl.textContent = domainShort;
        }

        // Cập nhật Footer
        const footer = tile.querySelector('.screen-tile-footer');
        if (footer) {
          let statusHtml = '';
          if (leadCheckStatus === 'confirmed' || leadCheckStatus === 'matched') {
            statusHtml = `<span class="tile-status status-lead">✅ Có Lead (Màn ${(completedScreens || 0) + 1})</span>`;
          } else if (leadCheckStatus === 'checking') {
            statusHtml = `<span class="tile-status status-checking">⏳ ${escHtml(entry.leadCheckMessage || 'Chờ lead (2×30s)...')}</span>`;
          } else if (leadObserveStatus === 'found') {
            statusHtml = `<span class="tile-status status-lead">✅ Có Lead (Màn ${(completedScreens || 0) + 1})</span>`;
          } else if (leadObserveStatus === 'waiting' || leadObserveStatus === 'api_error') {
            statusHtml = `<span class="tile-status status-checking">⏳ ${escHtml(entry.leadObserveMessage || 'Đang chờ lead')}</span>`;
          } else if (completedScreens > 0) {
            statusHtml = `<span class="tile-status status-jump">📄 Màn ${completedScreens + 1} (${pageJumps || completedScreens} lần nhảy)</span>`;
          } else {
            statusHtml = `<span class="tile-status status-idle">⚡ ${escHtml(currentAction || 'Đang mở offer...')}</span>`;
          }

          const bwBadge = entry.bandwidthFormatted
            ? `<span class="screen-tile-bw-badge" title="Băng thông: ↑${entry.bytesSent ? formatBytes(entry.bytesSent) : '0 B'} · ↓${entry.bytesReceived ? formatBytes(entry.bytesReceived) : '0 B'}">📶 ${entry.bandwidthFormatted}</span>`
            : '';

          const emailChip = entry.assignedEmail
            ? `<span class="tile-email-chip" title="Email gán: ${escHtml(entry.assignedEmail)}">📧 ${escHtml(entry.assignedEmail.split('@')[0])}</span>`
            : '';

          const footerHtml = `
            <div class="screen-tile-ip-row">
              <span class="screen-tile-ip-badge" onclick="event.stopPropagation(); copyTextToClipboard('${ip}');" title="Nhấp để copy IP: ${ip || ''}">
                🌐 <b>${ip || 'Đang kết nối...'}</b>
                ${ip ? '<span style="font-size:9.5px;opacity:0.75;">📋</span>' : ''}
              </span>
              <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">
                ${bwBadge}
                <span class="screen-tile-offer-badge">Offer ${offerNumber || 1}</span>
              </div>
            </div>
            <div class="screen-tile-status-row">
              ${statusHtml}
              ${emailChip}
            </div>
          `;
          if (footer._uxHtml !== footerHtml) {
            footer.innerHTML = footerHtml;
            footer._uxHtml = footerHtml;
          }
        }

        tile.title = ip ? `Slot ${slot} (${ip}) — Nhấp để mở màn hình tương tác full` : `Slot ${slot} — Nhấp để mở màn hình tương tác full`;

        // Refresh ảnh bằng cache-buster (chỉ tải khi slot không đang mở xem trực tiếp ở modal)
        // Stagger các request chụp cách nhau 80ms để không dồn 15 request cùng 1 lúc làm đơ Chrome
        if (_screenActiveSlot === slot || !_isThumbnailVisible(tile)) continue;
        const img = tile.querySelector('.screen-tile-img-container img');
        if (img && !img._uxLoading) {
          img._uxLoading = true;
          const targetSlot = slot;
          setTimeout(() => {
            if (!_screenViewActive || document.hidden || !tile.isConnected || _screenActiveSlot === targetSlot || !_isThumbnailVisible(tile)) { img._uxLoading = false; return; }
            const next = new Image();
            next.onload = () => { img.src = next.src; img._uxLoading = false; };
            next.onerror = () => { img._uxLoading = false; };
            next.src = `/screen/snapshot/${targetSlot}?t=${Date.now()}`;
          }, tileIdx * 80);
        }
      }
    }
