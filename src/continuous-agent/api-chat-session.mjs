/**
 * Bảng giao thức: mỗi nhà cung cấp chỉ khác đường dẫn, header xác thực, khung body và chỗ lấy text trả về.
 * Thêm nhà cung cấp mới = thêm một mục ở đây. URL do người dùng nhập có thể là base hoặc endpoint đầy đủ.
 */
const text = parts => (Array.isArray(parts) ? parts.map(part => part?.text ?? '').join('') : parts);
const FORMATS = {
  openai: {
    suffix: '/chat/completions',
    path: () => '/chat/completions',
    headers: key => ({ authorization: `Bearer ${key}` }),
    body: (model, messages) => ({ model, messages }),
    parse: json => text(json?.choices?.[0]?.message?.content),
  },
  anthropic: {
    suffix: '/messages',
    path: base => (/\/v1$/.test(base) ? '/messages' : '/v1/messages'),
    headers: key => ({ 'x-api-key': key, 'anthropic-version': '2023-06-01' }),
    body: (model, messages) => ({ model, max_tokens: 4096, messages }),
    parse: json => text(json?.content),
  },
  gemini: {
    suffix: ':generateContent',
    path: (base, model) => (/\/v1(beta)?$/.test(base) ? '' : '/v1beta') + `/models/${encodeURIComponent(model)}:generateContent`,
    headers: key => ({ 'x-goog-api-key': key }),
    body: (model, messages) => ({ contents: messages.map(message => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] })) }),
    parse: json => text(json?.candidates?.[0]?.content?.parts),
  },
};
export const API_FORMATS = Object.keys(FORMATS);

/**
 * Chuẩn hóa URL endpoint theo giao thức. Chỉ cho https; http chỉ cho máy nội bộ (localhost/127.0.0.1/::1)
 * để key không đi plaintext qua mạng. URL đã có đuôi endpoint (vd `/chat/completions`, `/messages`,
 * `:generateContent`) được giữ nguyên, nên dán URL đầy đủ của gateway tùy chỉnh cũng được.
 *
 * @param {string} baseUrl URL người dùng nhập.
 * @param {string} [format='openai'] openai | anthropic | gemini.
 * @param {string} [model=''] Tên model (Gemini đặt model trong đường dẫn).
 * @return {string} URL endpoint đầy đủ.
 * @throws {Error} Khi URL/format sai hoặc dùng http tới host ngoài.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function resolveApiUrl(baseUrl, format = 'openai', model = '') {
  const spec = FORMATS[format];
  if (!spec) throw new Error(`apiFormat phải là một trong: ${API_FORMATS.join(', ')}`);
  let url;
  try { url = new URL(String(baseUrl || '').trim()); } catch { throw new Error('API URL không hợp lệ'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('API URL phải là https (http chỉ cho localhost)');
  if (format === 'gemini' && !model && !url.pathname.includes(spec.suffix)) throw new Error('Thiếu tên model');
  url.username = ''; url.password = ''; url.hash = '';
  let path = url.pathname.replace(/\/+$/, '');
  if (!path.endsWith(spec.suffix)) path += spec.path(path, model);
  url.pathname = path;
  return url.toString();
}

/** Tương thích cũ: endpoint OpenAI chat-completions. */
export const resolveChatUrl = baseUrl => resolveApiUrl(baseUrl, 'openai');

/**
 * Transport HTTP nhiều nhà cung cấp (OpenAI-compatible, Anthropic Messages, Google Gemini), cùng giao diện với
 * `createAgySession`. API không giữ hội thoại nên app giữ lịch sử: luôn gửi lượt đầu (luật + record) cùng
 * đuôi `2*keepTurns` message gần nhất (bắt đầu bằng assistant để vai trò luôn xen kẽ), các màn cũ bị bỏ
 * để token không cộng dồn.
 *
 * @param {object} options baseUrl, apiKey, model, format, timeoutMs, keepTurns, fetchFn (tiêm cho test).
 * @return {{send:Function,close:Function,kill:Function,readonly turns:number,readonly conversationId:null}} Phiên transport.
 * @author ductv <ductv@getflycrm.com>
 * @since 2026-11-15
 */
export function createApiChatSession({ baseUrl, apiKey, model, format = 'openai', timeoutMs = 100_000, keepTurns = 3, fetchFn = fetch } = {}) {
  const spec = FORMATS[format];
  const endpoint = resolveApiUrl(baseUrl, format, model);
  if (!apiKey) throw new Error('Thiếu API key');
  if (!model) throw new Error('Thiếu tên model');
  let messages = [], turns = 0, controller = null;
  // Chỉ che phần body do server trả (có thể echo key); không che thông báo của chính app.
  const redact = body => apiKey.length >= 8 ? String(body).split(apiKey).join('***') : String(body);

  /**
   * Gửi một lượt; lỗi thì bỏ lượt user vừa thêm để retry không bị nhân đôi.
   * @param {string} content Nội dung lượt.
   * @return {Promise<{text:string,usage:object,conversationId:null}>} Phản hồi của model.
   */
  const send = async content => {
    if (controller) throw new Error('turn_in_flight');
    const local = new AbortController();
    controller = local;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; local.abort(); }, timeoutMs);
    timer.unref?.();
    const rollback = messages.length;
    messages.push({ role: 'user', content });
    try {
      const sent = messages.length > 1 ? [messages[0], ...messages.slice(1).slice(-(2 * keepTurns))] : messages;
      const response = await fetchFn(endpoint, { method: 'POST', headers: { 'content-type': 'application/json', ...spec.headers(apiKey) }, body: JSON.stringify(spec.body(model, sent)), signal: local.signal });
      if (!response.ok) throw new Error(`API ${response.status}: ${redact((await response.text().catch(() => '')).slice(0, 200))}`);
      const json = await response.json();
      const reply = spec.parse(json);
      if (typeof reply !== 'string') throw new Error(`API (${format}) trả phản hồi không hợp lệ: không có nội dung text`);
      messages = [...sent, { role: 'assistant', content: reply }];
      turns += 1;
      return { text: reply, usage: json.usage || json.usageMetadata || {}, conversationId: null };
    } catch (error) {
      messages.length = Math.min(messages.length, rollback);
      if (local.signal.aborted) throw new Error(timedOut ? `API timeout (quá ${timeoutMs / 1000}s)` : 'api_closed');
      throw error;
    } finally {
      clearTimeout(timer);
      if (controller === local) controller = null;
    }
  };

  /**
   * Hủy request đang bay (nếu có).
   * @return {void}
   */
  const kill = () => { controller?.abort(); };

  /**
   * Xóa lịch sử để lượt kế tiếp mở hội thoại mới.
   * @return {void}
   */
  const close = () => { kill(); messages = []; turns = 0; };

  return { send, close, kill, get turns() { return turns; }, get conversationId() { return null; } };
}
