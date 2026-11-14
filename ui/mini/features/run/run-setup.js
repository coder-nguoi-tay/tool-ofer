// Tab Vận hành: huỷ hẹn giờ và nạp trạng thái AI Assist thật từ cấu hình AI.
(() => {
  document.getElementById('miniScheduleCancel')?.addEventListener('click', () => {
    miniRunCancelSchedule();
    showToast('Đã huỷ hẹn giờ');
  });
  // Trạng thái AI Assist lấy từ cấu hình AI (mode khác "disabled" là đang bật), không phải mặc định của ô.
  fetch('/ai/config').then(res => res.json()).then(config => {
    const checkbox = document.getElementById('cbxAiAssist');
    if (!checkbox || !config) return;
    checkbox.checked = config.enabled !== false && config.mode !== 'disabled';
    syncOptionPills();
  }).catch(() => {});
})();
