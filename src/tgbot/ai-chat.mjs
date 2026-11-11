import { AI_SYSTEM } from './state/ai-system.mjs';
import { chatHistory } from './state/chat-history.mjs';

/**
 * Ai chat.
 * @param {string} userText user text.
 * @param {*} appState app state.
 * @return {Promise<*>} Kết quả xử lý ai chat.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-10
 */
async function aiChat(userText, appState) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const ctx = appState ? `[App hiện tại: active=${appState.activeCount}/${appState.targetCount}, enabled=${appState.enabled}, proxy=${appState._proxyAvail ?? '?'}, leads=${appState.limitRun?.count ?? 0}/${appState.limitRun?.max ?? 0}]` : '';

  // Thêm vào history
  chatHistory.push({
    role: 'user',
    content: `${ctx}\n${userText}`
  });
  if (chatHistory.length > 10) chatHistory.splice(0, 2);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: AI_SYSTEM,
        messages: chatHistory
      })
    });
    const data = await res.json();
    const raw = data.content?.[0]?.text ?? '';
    // Lưu reply vào history
    chatHistory.push({
      role: 'assistant',
      content: raw
    });
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}
export { aiChat };
