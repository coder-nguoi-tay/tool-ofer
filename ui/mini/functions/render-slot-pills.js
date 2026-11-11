/**
 * Render slot pills.
 * @return {void} Kết quả xử lý render slot pills.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
function renderSlotPills() {
      if (!activeSessions.length) {
        slotBar.innerHTML = '<div class="pill-btn active">Chưa có slot</div>';
        return;
      }
      slotBar.innerHTML = `
        <div class="pill-btn" onclick="switchScreenViewMode('grid')" style="background:#1e293b; color:#38bdf8; border-color:#38bdf8; font-weight:700;">
          📱 Xem Lưới
        </div>
        ${activeSessions.map((s) => `
          <div class="pill-btn ${s.slot === currentSlot ? 'active' : ''}" data-slot="${s.slot}">
            <span class="status-dot"></span> S${s.slot} (${s.exitIp || 'Local'})
          </div>
        `).join('')}
      `;

      slotBar.querySelectorAll('.pill-btn[data-slot]').forEach((p) => {
        p.addEventListener('click', () => {
          const slot = parseInt(p.dataset.slot, 10);
          if (slot && slot !== currentSlot) {
            startStream(slot);
            renderSlotPills();
          }
        });
      });
    }
