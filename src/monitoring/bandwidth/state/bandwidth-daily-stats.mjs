const bandwidthDailyStats = {
  totalBytesAllTime: 0,
  totalUploadAllTime: 0,
  totalDownloadAllTime: 0,
  totalRequestsAllTime: 0,
  /** Số dư 711 (bytes) ở lần poll gần nhất, dùng để tính lượng 711 thực trừ giữa 2 lần poll. */
  last711Balance: null,
  daily: {}
};
export { bandwidthDailyStats };
