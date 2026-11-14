/**
 * Nạp cấu hình Telegram; token đã lưu chỉ hiện dạng che (botTokenMasked) trong placeholder.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetLoadTelegram() {
  const cfg = await miniSetApi('/telegram/config');
  if (!cfg || cfg.error) return;
  const tokenEl = document.getElementById('setTgToken');
  if (tokenEl) {
    tokenEl.value = '';
    tokenEl.placeholder = cfg.hasToken ? `Đã lưu: ${cfg.botTokenMasked} (nhập token mới để thay)` : '123456789:AA...';
  }
  const userEl = document.getElementById('setTgUserId');
  if (userEl) userEl.value = cfg.allowedUserId || '';
  const chatEl = document.getElementById('setTgChatId');
  if (chatEl) chatEl.value = cfg.notifyChatId || '';
  miniSetStatus('setTgStatus', cfg.configured ? '✅ Đã cấu hình — bot đang chạy.' : '⚠️ Chưa cấu hình bot.', Boolean(cfg.configured));
}

/**
 * Lưu Bot Token, User ID admin và Chat ID nhận thông báo (POST /telegram/config).
 * @return {Promise<boolean>} true khi lưu thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetSaveTelegram() {
  const botToken = document.getElementById('setTgToken')?.value.trim() || '';
  const allowedUserId = document.getElementById('setTgUserId')?.value.trim() || '';
  const notifyChatId = document.getElementById('setTgChatId')?.value.trim() || '';
  if (!botToken) { showToast('Nhập Bot Token trước khi lưu.'); return false; }
  if (!allowedUserId) { showToast('Nhập User ID Telegram (admin) trước khi lưu.'); return false; }
  miniSetStatus('setTgStatus', 'Đang lưu...');
  const res = await miniSetApi('/telegram/config', { method: 'POST', body: JSON.stringify({ botToken, allowedUserId, notifyChatId }) });
  if (!res?.ok) {
    miniSetStatus('setTgStatus', res?.message || res?.error || 'Lưu thất bại.', false);
    return false;
  }
  await miniSetLoadTelegram();
  miniSetStatus('setTgStatus', res.message || 'Đã lưu cấu hình Telegram.', true);
  return true;
}

/**
 * Gửi tin nhắn thử tới Telegram (POST /telegram/test).
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-14
 */
async function miniSetTestTelegram() {
  miniSetStatus('setTgStatus', 'Đang gửi tin thử...');
  const res = await miniSetApi('/telegram/test', { method: 'POST' });
  const msg = res?.message || (res?.ok ? 'Đã gửi tin thử.' : res?.error || 'Gửi thử thất bại.');
  miniSetStatus('setTgStatus', msg, Boolean(res?.ok));
  showToast(msg);
}
