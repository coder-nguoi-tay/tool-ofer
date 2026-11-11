/**
 * Save telegram config ui.
 * @return {Promise<void>} Kết quả xử lý save telegram config ui.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function saveTelegramConfigUI() {
      const statusEl = document.getElementById('tgStatus');
      const botToken = document.getElementById('TgBotToken').value.trim();
      const allowedUserId = document.getElementById('TgAllowedUserId').value.trim();
      const notifyChatId = document.getElementById('TgNotifyChatId').value.trim();
      if (!botToken) {
        showWinAlert('Nhập Bot Token trước khi lưu.');
        return;
      }
      if (!allowedUserId) {
        showWinAlert('Nhập User ID Telegram (admin) trước khi lưu.');
        return;
      }
      if (statusEl) { statusEl.textContent = 'Đang lưu...'; statusEl.style.color = '#0078d7'; }
      const res = await api('/telegram/config', {
        method: 'POST',
        body: JSON.stringify({ botToken, allowedUserId, notifyChatId }),
      });
      if (res?.ok) {
        if (statusEl) { statusEl.textContent = res.message || 'Đã lưu cấu hình Telegram.'; statusEl.style.color = '#28a745'; }
        await loadTelegramConfig();
      } else {
        if (statusEl) { statusEl.textContent = res?.message || 'Lưu thất bại.'; statusEl.style.color = '#c50f1f'; }
        showWinAlert(res?.message || 'Lưu cấu hình Telegram thất bại.');
      }
    }
