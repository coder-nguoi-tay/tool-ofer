/**
 * Nạp cấu hình Agent API vào form. Server không bao giờ trả key: chỉ báo đã có key và 4 ký tự cuối.
 * @return {Promise<void>} Hoàn tất khi form được cập nhật.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
async function loadAgentApiConfigUi() {
  const cfg = await api('/agent/api/config');
  if (!cfg || cfg.error || !document.getElementById('cbbAgentTransport')) return;
  document.getElementById('cbbAgentTransport').value = cfg.transport || 'agy';
  document.getElementById('cbbAgentApiFormat').value = cfg.apiFormat || 'openai';
  document.getElementById('txtAgentApiUrl').value = cfg.apiBaseUrl || '';
  document.getElementById('txtAgentApiModel').value = cfg.apiModel || '';
  const keyInput = document.getElementById('txtAgentApiKey');
  keyInput.value = '';
  keyInput.placeholder = cfg.apiKeySet ? `Đã lưu key (${cfg.apiKeyHint}) — để trống để giữ nguyên` : 'Dán API key';
  syncAgentApiFormat();
}

/**
 * Đổi gợi ý URL/model theo giao thức đang chọn và ẩn phần API khi dùng agy.
 * @return {void}
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
function syncAgentApiFormat() {
  const hints = {
    openai: ['https://api.openai.com/v1', 'gpt-4o-mini'],
    anthropic: ['https://api.anthropic.com', 'tên model Anthropic'],
    gemini: ['https://generativelanguage.googleapis.com', 'gemini-2.0-flash'],
  };
  const [url, model] = hints[document.getElementById('cbbAgentApiFormat').value] || hints.openai;
  document.getElementById('txtAgentApiUrl').placeholder = url;
  document.getElementById('txtAgentApiModel').placeholder = model;
  document.getElementById('agentApiFields').style.opacity = document.getElementById('cbbAgentTransport').value === 'api' ? '1' : '0.5';
}
