/**
 * Ghép hoặc thu hồi quyền MCP trên tab đang xem và hiển thị kết quả cho người vận hành.
 * @param {'share'|'revoke'} action Thao tác do người dùng chọn.
 * @return {Promise<void>} Hoàn tất cập nhật trạng thái trong Screen View.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-19
 */
async function updateScreenFormMcp(action) {
  const slot = _screenActiveSlot;
  const panel = document.getElementById('screenMcpPanel');
  if (!slot) return;
  const output = panel.elements.namedItem('status');
  output.value = 'Đang xử lý…';
  try {
    const response = await fetch('/form-mcp/' + action + '/' + slot, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: panel.elements.code.value.trim() }) });
    const result = await response.json();
    if (slot !== _screenActiveSlot) return;
    if (!response.ok) throw new Error(result.error);
    panel.elements.code.value = '';
    output.value = action === 'share' ? 'Đã ghép ' + result.origin + ' đến ' + new Date(result.expiresAt).toLocaleTimeString() : 'Đã ngắt ghép.';
  } catch (error) {
    if (slot === _screenActiveSlot) output.value = error.message;
  }
}
