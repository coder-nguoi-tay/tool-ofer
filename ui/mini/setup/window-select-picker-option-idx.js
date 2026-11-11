window.selectPickerOption = async (idx) => {
      await sendInput({ type: 'select', index: idx });
      closeSelectModal();
      showToast('Đã chọn mục');
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
