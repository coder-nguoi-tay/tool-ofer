/**
 * Mở Screen View của slot và xóa nội dung HTML cùng hình ảnh của slot trước.
 * @param {number} slot Slot cần xem.
 * @return {void} Hiển thị ảnh thu nhỏ hiện có trong khi kết nối với slot.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
function openScreenModal(slot) {
      _screenActiveSlot = slot;
      const mcpPanel = document.getElementById('screenMcpPanel');
      if (mcpPanel) { mcpPanel.hidden = true; mcpPanel.reset(); }
      const htmlPanel = document.getElementById('screenHtmlPanel');
      if (htmlPanel) { htmlPanel.style.display = 'none'; htmlPanel.dataset.request = String(Number(htmlPanel.dataset.request || 0) + 1); }
      document.getElementById('screenModal').style.display = 'flex';
      const entry = _screenSlots.find(s => s.slot === slot);
      const modalTitle = document.getElementById('screenModalTitle');
      if (modalTitle) {
        modalTitle.innerHTML = `Màn hình Slot ${slot} • <span style="color:#22c55e;">🌐 IP: ${escHtml(entry?.ip || 'Direct')}</span> • <span style="color:#a7f3d0;font-weight:600;" title="Băng thông luồng này">📶 ${escHtml(entry?.bandwidthFormatted || '0 B')}</span> • <span style="color:#cbd5e1;" title="${escHtml(entry?.deviceSummary || '')}">${escHtml(entry?.deviceVersion || entry?.deviceProfile || 'Windows 10')}</span> • <span style="color:#38bdf8;">${escHtml(getCleanBrowserVersion(entry?.version, entry?.engine))}</span> <span style="font-size:11px;font-weight:normal;color:#94a3b8;">(nhấp canvas để điều khiển)</span>`;
      }

      const fpsEl = document.getElementById('screenModalFps');
      if (fpsEl) {
        if (!entry) {
          fpsEl.textContent = '🔴 Đã ngắt';
          fpsEl.title = 'Phiên đã đóng';
          fpsEl.style.color = '#f87171';
        } else {
          fpsEl.textContent = '🟢 Kết nối...';
          fpsEl.title = 'Đang kết nối luồng screencast...';
          fpsEl.style.color = '#38bdf8';
        }
      }

      const canvas = document.getElementById('screenCanvas');
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const tileImg = document.querySelector(`.screen-tile-card[data-slot="${slot}"] img`);
        if (tileImg && tileImg.complete && tileImg.naturalWidth > 0) {
          if (canvas.width !== tileImg.naturalWidth || canvas.height !== tileImg.naturalHeight) {
            canvas.width = tileImg.naturalWidth;
            canvas.height = tileImg.naturalHeight;
          }
          try { ctx.drawImage(tileImg, 0, 0); } catch { }
        }
      }

      _startScreenStream(slot);
    }
