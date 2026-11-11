/**
 * Load telegram config.
 * @return {Promise<void>} Kết quả xử lý load telegram config.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function loadTelegramConfig() {
      try {
        const cfg = await api('/telegram/config');
        if (cfg?.error) return;
        const tokenEl = document.getElementById('TgBotToken');
        const userEl = document.getElementById('TgAllowedUserId');
        const chatEl = document.getElementById('TgNotifyChatId');
        const statusEl = document.getElementById('tgStatus');
        if (tokenEl) {
          tokenEl.value = '';
          tokenEl.placeholder = cfg.hasToken
            ? `Đã lưu: ${cfg.botTokenMasked} (nhập token mới để thay)`
            : '123456789:AA...';
        }
        if (userEl) userEl.value = cfg.allowedUserId || '';
        if (chatEl) chatEl.value = cfg.notifyChatId || '';
        if (statusEl) {
          statusEl.textContent = cfg.configured
            ? '✅ Đã cấu hình — bot đang chạy.'
            : '⚠️ Chưa cấu hình bot.';
          statusEl.style.color = cfg.configured ? '#28a745' : '#c50f1f';
        }
      } catch (err) {
        console.warn('[Telegram] Không nạp được cấu hình:', err.message);
      }
    }
