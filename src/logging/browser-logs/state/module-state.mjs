const moduleState = {
  saveBrowserLogsTimer: null,
  // Số thứ tự toàn cục của sự kiện log và mốc khởi động tiến trình (client gửi lại để biết app đã khởi động lại).
  logSeq: 0,
  logEpoch: Date.now()
};
export { moduleState };
