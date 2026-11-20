/**
 * Gửi nội dung ô nhập nhanh và chỉ xóa bản nháp đã được tab nhận.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
document.getElementById('btnSendText')?.addEventListener('click', async () => {
      const input = document.getElementById('textInput');
      const text = input?.value;
      if (!text) return;
      const result = await sendInput({ type: 'insertText', text });
      if (!result?.ok) { showToast(result?.error || 'Chưa nhập được văn bản.'); return; }
      if (input.value === text) input.value = '';
      showToast('Đã chèn văn bản.');
      try { tg?.HapticFeedback?.notificationOccurred('success'); } catch (e) {}
    });
