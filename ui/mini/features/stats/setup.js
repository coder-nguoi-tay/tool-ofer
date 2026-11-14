// ─── TAB 4 THỐNG KÊ: khởi tạo bộ lọc log, cookie toffers, khối băng thông và tự làm mới log ───
(() => {
  const typeEl = document.getElementById('stLogType');
  if (typeEl) {
    typeEl.innerHTML = '<option value="">Tất cả loại</option>'
      + Object.entries(miniStatsLogTypes).map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
  }
  const cookieEl = document.getElementById('stLeadCookie');
  if (cookieEl) cookieEl.value = localStorage.getItem('toffers_custom_cookie') || '';
  const bwEl = document.getElementById('stBwDetails');
  if (bwEl) bwEl.addEventListener('toggle', () => miniStatsToggleBandwidth(bwEl.open));
  // Log chỉ tự làm mới khi đang mở tab Thống kê và bật "Tự làm mới".
  setInterval(() => {
    if (document.getElementById('stLogAuto')?.checked && document.getElementById('tab-stats')?.classList.contains('active')) pollLogs();
  }, 3000);
})();
