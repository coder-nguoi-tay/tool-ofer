/**
 * Chèn bản nháp một lần cho mỗi lượt gửi của tab và giữ nội dung khi gửi thất bại.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
window.submitModalText = async () => {
  const input = document.getElementById('modalTextInput');
  const dialog = miniTextDialog;
  if (!input?.value || !dialog.target || dialog.submitting) return;
  const text = input.value;
  if (dialog.target.screenSourceId !== canvas.dataset.screenSourceId) {
    showToast('Tab đang xem đã thay đổi. Hãy mở lại ô nhập.');
    return;
  }
  setMiniDraftSubmitting(input, true);
  try {
    const result = await sendInput({ type: 'insertText', text, ...dialog.target });
    if (dialog !== miniTextDialog || canvas.dataset.screenSourceId !== dialog.target.screenSourceId) return;
    if (!result?.ok) { showToast(result?.error || 'Chưa nhập được văn bản.'); return; }
    showToast('Đã chèn văn bản.');
    if (input.value !== text) return;
    closeTypeModal();
    try { tg?.HapticFeedback?.notificationOccurred('success'); } catch {}
  } finally {
    if (dialog === miniTextDialog) setMiniDraftSubmitting(input, false);
  }
};

/**
 * Gửi một phím điều hướng từ hộp nhập đang mở tới đúng tab.
 * @param {string} key Phím người dùng bấm.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
window.pressModalKey = async key => {
  const dialog = miniTextDialog;
  if (!dialog.target || dialog.submitting) return;
  const result = await sendInput({ type: 'press', key, ...dialog.target });
  if (dialog !== miniTextDialog) return;
  showToast(result?.ok ? `Đã gửi ${key}.` : result?.error || 'Chưa gửi được phím.');
};
