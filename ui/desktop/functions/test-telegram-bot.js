/**
 * Test telegram bot.
 * @return {Promise<void>} Kết quả xử lý test telegram bot.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function testTelegramBot() {
      const statusEl = document.getElementById('tgStatus');
      if (statusEl) { statusEl.textContent = 'Đang gửi tin thử...'; statusEl.style.color = '#0078d7'; }
      const res = await api('/telegram/test', { method: 'POST' });
      if (statusEl) {
        statusEl.textContent = res?.message || (res?.ok ? 'Đã gửi tin thử.' : 'Gửi thử thất bại.');
        statusEl.style.color = res?.ok ? '#28a745' : '#c50f1f';
      }
      showWinAlert(res?.message || (res?.ok ? 'Đã gửi tin thử tới Telegram.' : 'Gửi tin thử thất bại.'));
    }
