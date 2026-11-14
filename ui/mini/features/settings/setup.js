// Tab ⚙️ Cài đặt: gắn nút và nạp cấu hình một lần khi mở app (không nạp lại khi đổi tab để giữ chỗ đang sửa dở).
(() => {
  const on = (id, handler) => document.getElementById(id)?.addEventListener('click', handler);
  on('setPcSave', () => miniSetSavePcSettings());
  on('setTgSave', () => miniSetSaveTelegram());
  on('setTgTest', () => miniSetTestTelegram());
  on('setAiSave', () => miniSetSaveAi());
  on('setAiReset', () => { if (confirm('Khôi phục cài đặt AI mặc định? Chỉ dẫn tùy chỉnh sẽ bị xóa.')) miniSetResetAi(); });
  on('setAiTest', () => miniSetTestAi());
  document.getElementById('setHelpBox')?.addEventListener('toggle', event => {
    if (event.target.open) miniSetLoadHelp();
  });
  miniSetLoadPcSettings();
  miniSetLoadTelegram();
  miniSetLoadAi();
})();
