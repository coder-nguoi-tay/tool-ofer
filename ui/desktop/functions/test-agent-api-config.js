/**
 * Lưu rồi gọi thử một câu tới API đã cấu hình để kiểm tra URL, key và model.
 * @return {Promise<void>} Hoàn tất khi có kết quả hiển thị.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
async function testAgentApiConfigUi() {
  const statusEl = document.getElementById('agentApiStatus');
  if (!(await saveAgentApiConfigUi())) return;
  statusEl.style.color = '#38bdf8';
  statusEl.textContent = 'Đang thử kết nối...';
  const res = await api('/agent/api/test', { method: 'POST', body: '{}' });
  statusEl.style.color = res && res.ok ? '#10b981' : '#f87171';
  statusEl.textContent = res && res.ok ? `Kết nối OK (${res.ms}ms) — model trả: ${res.reply}` : 'Thất bại: ' + (res && res.error || 'không rõ');
}
