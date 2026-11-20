// Smart Autofill Chips Injection

/**
 * Chèn đoạn văn bản người dùng chọn ở vị trí con trỏ và báo kết quả.
 * @param {string} text Nội dung đã chọn.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
    window.injectAutofillText = async (text) => {
      if (!text) return;
      const result = await sendInput({ type: 'insertText', text });
      if (!result?.ok) { showToast(result?.error || 'Chưa nhập được văn bản.'); return; }
      showToast('Đã chèn văn bản.');
      try { tg?.HapticFeedback?.notificationOccurred('success'); } catch {}
    };
