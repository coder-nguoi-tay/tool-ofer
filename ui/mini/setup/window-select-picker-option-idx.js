/**
 * Gửi lựa chọn thủ công về đúng ô đã mở và hiển thị kết quả xác nhận từ tab.
 * @param {number} index Vị trí của mục đã chọn.
 * @param {string} uid Mã của lần mở danh sách.
 * @return {Promise<void>}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-20
 */
window.selectPickerOption = async (index, uid) => {
  closeSelectModal();
  const result = await sendInput({ type: 'select', index, uid });
  showToast(result?.ok ? 'Đã chọn mục' : 'Chưa chọn được mục. Hãy mở lại danh sách.');
};

    window.quickPickOption = async (choice) => {
      showToast(choice === 'random' ? '🎲 Đang chọn ngẫu nhiên 1 hoặc 2...' : `🎯 Đang chọn Option ${choice + 1}...`);
      try { tg?.HapticFeedback?.impactOccurred('medium'); } catch {}
      const res = await sendInput({ type: 'pickSurveyOption', choice });
      if (res?.ok) {
        showToast(`✅ Đã chọn Option ${res.choice}: ${res.label || ''}`);
        try { tg?.HapticFeedback?.notificationOccurred('success'); } catch {}
      } else {
        showToast(res?.message || 'Không tìm thấy lựa chọn nào');
      }
    };

    window.quickSubmitNext = async () => {
      showToast('🚀 Đang chuyển tiếp bước...');
      try { tg?.HapticFeedback?.impactOccurred('heavy'); } catch {}
      const res = await sendInput({ type: 'clickNext' });
      if (res?.ok) {
        showToast(`✅ Đã bấm: ${res.label}`);
        try { tg?.HapticFeedback?.notificationOccurred('success'); } catch {}
      } else {
        showToast(res?.message || 'Không tìm thấy nút Next/Submit');
      }
    };
