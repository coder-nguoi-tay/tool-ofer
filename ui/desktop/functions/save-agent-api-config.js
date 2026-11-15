/**
 * Lưu cấu hình Agent API. Key để trống thì server giữ key cũ; sau khi lưu ô key được xóa khỏi form.
 * @return {Promise<boolean>} True khi lưu thành công.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
async function saveAgentApiConfigUi() {
  const statusEl = document.getElementById('agentApiStatus');
  const res = await api('/agent/api/config', {
    method: 'POST',
    body: JSON.stringify({
      transport: document.getElementById('cbbAgentTransport').value,
      apiFormat: document.getElementById('cbbAgentApiFormat').value,
      apiBaseUrl: document.getElementById('txtAgentApiUrl').value,
      apiModel: document.getElementById('txtAgentApiModel').value,
      apiKey: document.getElementById('txtAgentApiKey').value,
    }),
  });
  const ok = Boolean(res && res.success);
  statusEl.style.color = ok ? '#10b981' : '#f87171';
  statusEl.textContent = ok ? 'Đã lưu cấu hình Agent.' : 'Lỗi lưu: ' + (res && res.error || 'Thất bại');
  if (ok) await loadAgentApiConfigUi();
  return ok;
}
