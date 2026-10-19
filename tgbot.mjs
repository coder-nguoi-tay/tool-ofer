/**
 * Telegram bot — điều khiển AutoLeadPC + AI agent chat tự nhiên.
 * Config: ~/Library/Application Support/AutoLeadPC/telegram-config.json
 * { "botToken": "...", "allowedUserId": 123456789, "notifyChatId": 123456789 }
 */

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const instanceId = process.env.AUTOLEADPC_INSTANCE || '1';
const instanceSuffix = instanceId !== '1' ? `-${instanceId}` : '';
const dataDirName = process.env.AUTOLEADPC_DATA_DIR || `AutoLeadPC${instanceSuffix}`;

const APP_PORT = Number(process.env.AUTOLEADPC_PORT) || 3210;
const APP_BASE = `http://127.0.0.1:${APP_PORT}`;

let cfg = null;
let lastUpdateId = 0;
let notifyChatId = null;

let lastActiveCount = 0;
let lastLimitRunCount = 0;
let stuckSince = null;
let lowProxyNotified = false;
let sessionLeadsAtBotStart = 0;
let botStartTime = Date.now();

// Lịch sử chat để AI nhớ ngữ cảnh (tối đa 10 lượt)
const chatHistory = [];

// ─── Telegram API ─────────────────────────────────────────────────────────────

async function tgPost(method, body = {}) {
  const r = await fetch(`https://api.telegram.org/bot${cfg.botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// Gửi tin + nút inline tùy chọn
// buttons: [[{ text, cb }]] — mảng hàng, mỗi hàng là mảng nút
async function send(chatId, text, buttons = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (buttons?.length) {
    body.reply_markup = {
      inline_keyboard: buttons.map((row) =>
        row.map((b) => ({ text: b.text, callback_data: b.cb }))
      ),
    };
  }
  return tgPost('sendMessage', body).catch(() => {});
}

async function answerCallback(id, text = '') {
  await tgPost('answerCallbackQuery', { callback_query_id: id, text }).catch(() => {});
}

// ─── Push notification (dùng từ app.mjs) ─────────────────────────────────────

export async function tgNotify(text, buttons = null) {
  if (!cfg || !notifyChatId) return;
  await send(notifyChatId, text, buttons);
}

// ─── Local app API ────────────────────────────────────────────────────────────

async function appGet(path) {
  const r = await fetch(`${APP_BASE}${path}`);
  return r.json();
}

async function readAutoRefillSettings() {
  try {
    const p = join(homedir(), 'Library', 'Application Support', dataDirName, 'autorefill-settings.json');
    const raw = JSON.parse(await readFile(p, 'utf8'));
    return raw?.settings ? raw : null;
  } catch { return null; }
}

async function appPost(path, body = {}) {
  const r = await fetch(`${APP_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return r.json();
}

// ─── Inline keyboard presets ──────────────────────────────────────────────────

const BTN_MAIN = [
  [{ text: '📊 Status', cb: 'status' }, { text: '▶ Run', cb: 'run' }],
  [{ text: '⏸ Pause', cb: 'pause' }, { text: '🛑 Stop', cb: 'stop' }],
  [{ text: '📦 Proxy', cb: 'proxy' }, { text: '🛒 Mua Proxy', cb: 'buy' }],
];

const BTN_RUNNING = [
  [{ text: '📊 Status', cb: 'status' }, { text: '⏸ Pause', cb: 'pause' }],
  [{ text: '🛑 Stop', cb: 'stop' }, { text: '📦 Proxy', cb: 'proxy' }],
];

const BTN_STOPPED = [
  [{ text: '▶ Run lại', cb: 'run' }, { text: '📊 Status', cb: 'status' }],
  [{ text: '🛒 Mua Proxy', cb: 'buy' }, { text: '📦 Proxy', cb: 'proxy' }],
];

// ─── AI Agent ─────────────────────────────────────────────────────────────────

const AI_SYSTEM = `Bạn là trợ lý AI quản lý app AutoLeadPC qua Telegram — app tự động điền form leads trên Mac, dùng proxy và email queue.

Bạn có thể thực hiện các hành động sau:
- status: xem trạng thái đầy đủ
- run [n]: bật tự bù (n = số luồng, mặc định giữ nguyên)
- stop: dừng tất cả
- pause: tạm dừng mở slot mới (không kill session đang chạy)
- proxy: xem hàng đợi proxy
- email: xem hàng đợi email
- buy_proxy: mua thêm proxy từ 711proxy
- done: xem leads hoàn thành
- speed: tốc độ leads/giờ
- reset: reset bộ đếm leads
- log: log session gần nhất
- reply: chỉ trả lời bằng text, không thực hiện hành động

Trả về JSON duy nhất theo format:
{
  "action": "<action>",
  "params": { "count": <số nếu cần> },
  "message": "<câu trả lời tiếng Việt thân thiện ngắn gọn>",
  "suggestions": ["<nút gợi ý 1>", "<nút gợi ý 2>"]
}

"suggestions" là tối đa 3 hành động gợi ý tiếp theo phù hợp với ngữ cảnh.
Chỉ trả về JSON, không giải thích thêm.`;

async function aiChat(userText, appState) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;

  const ctx = appState
    ? `[App hiện tại: active=${appState.activeCount}/${appState.targetCount}, enabled=${appState.enabled}, proxy=${appState._proxyAvail ?? '?'}, leads=${appState.limitRun?.count ?? 0}/${appState.limitRun?.max ?? 0}]`
    : '';

  // Thêm vào history
  chatHistory.push({ role: 'user', content: `${ctx}\n${userText}` });
  if (chatHistory.length > 10) chatHistory.splice(0, 2);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        system: AI_SYSTEM,
        messages: chatHistory,
      }),
    });
    const data = await res.json();
    const raw = data.content?.[0]?.text ?? '';
    // Lưu reply vào history
    chatHistory.push({ role: 'assistant', content: raw });
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    return json ? JSON.parse(json) : null;
  } catch {
    return null;
  }
}

// Chuyển suggestion text → inline button
function suggestionsToButtons(suggestions = []) {
  const MAP = {
    'status': { text: '📊 Status', cb: 'status' },
    'run': { text: '▶ Run', cb: 'run' },
    'stop': { text: '🛑 Stop', cb: 'stop' },
    'pause': { text: '⏸ Pause', cb: 'pause' },
    'proxy': { text: '📦 Proxy', cb: 'proxy' },
    'email': { text: '📧 Email', cb: 'email' },
    'buy_proxy': { text: '🛒 Mua Proxy', cb: 'buy' },
    'done': { text: '✅ Leads', cb: 'done' },
    'speed': { text: '⚡ Speed', cb: 'speed' },
    'log': { text: '📋 Log', cb: 'log' },
    'reset': { text: '🔄 Reset', cb: 'reset' },
    'clear_log': { text: '🗑 Xóa Log', cb: 'clear_log' },
  };
  const btns = suggestions.map((s) => MAP[s] || MAP[s.toLowerCase()]).filter(Boolean);
  if (!btns.length) return null;
  // Chia thành hàng 3
  const rows = [];
  for (let i = 0; i < btns.length; i += 3) rows.push(btns.slice(i, i + 3));
  return rows;
}

// ─── Xử lý lệnh ──────────────────────────────────────────────────────────────

async function execCommand(chatId, userId, cmdText) {
  if (userId !== cfg.allowedUserId) return;
  if (notifyChatId === null) notifyChatId = chatId;

  const cmd = cmdText.trim().split(/\s+/);
  const name = cmd[0].toLowerCase();

  if (name === '/status' || name === 'status') {
    const [state, pq, eq] = await Promise.all([
      appGet('/state'), appGet('/proxy-queue'), appGet('/email-queue'),
    ]);
    const running = state.enabled && !state.stopRequested;
    const elapsed = Math.max(1, Math.round((Date.now() - botStartTime) / 60000));
    const leads = state.limitRun?.count ?? 0;
    const speed = Math.round(((leads - sessionLeadsAtBotStart) / elapsed) * 60);
    await send(chatId,
      `<b>📊 Trạng thái</b>\n` +
      `▶ Luồng: ${state.activeCount}/${state.targetCount} ${running ? '🟢' : '🔴'}\n` +
      `📦 Proxy: ${pq.available} còn / ${pq.used} dùng\n` +
      `📧 Email: ${eq.available} còn / ${eq.used} dùng\n` +
      `✅ Leads: ${leads}${state.limitRun?.max > 0 ? '/' + state.limitRun.max : ''}\n` +
      `⚡ Tốc độ: ~${speed} leads/giờ\n` +
      `💬 ${state.message || ''}`,
      running ? BTN_RUNNING : BTN_STOPPED,
    );

  } else if (name === '/run' || name === 'run') {
    const n = parseInt(cmd[1], 10);
    if (!n) {
      // Không có số → hiện menu chọn số luồng
      const state = await appGet('/state').catch(() => ({}));
      const cur = state.targetCount || 0;
      await send(chatId,
        `▶ <b>Chọn số luồng muốn chạy</b>${cur > 0 ? ` (hiện tại: ${cur})` : ''}:`,
        [
          [{ text: '1 luồng', cb: 'run_1' }, { text: '2 luồng', cb: 'run_2' }, { text: '3 luồng', cb: 'run_3' }],
          [{ text: '5 luồng', cb: 'run_5' }, { text: '8 luồng', cb: 'run_8' }, { text: '10 luồng', cb: 'run_10' }],
          [{ text: '15 luồng', cb: 'run_15' }, { text: '20 luồng', cb: 'run_20' }, { text: `Giữ nguyên (${cur || '?'})`, cb: 'run_0' }],
        ],
      );
      return;
    }
    const saved = await readAutoRefillSettings();
    if (saved?.settings) {
      // Fire-and-forget /launch (nó chạy lâu, không await)
      fetch(`${APP_BASE}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...saved.settings, requestedCount: n }),
      }).catch(() => {});
      await send(chatId,
        `⏳ Đang khởi động <b>${n} luồng</b>…\nGõ /status sau vài giây để xem tiến trình.`,
        [[{ text: '📊 Status', cb: 'status' }, { text: '🛑 Stop', cb: 'stop' }]],
      );
    } else {
      await appPost('/auto-refill', { enabled: true, targetCount: n });
      await send(chatId,
        `⚠️ Chưa có cấu hình lưu sẵn.\nVui lòng nhấn <b>Start</b> trong app 1 lần, sau đó <b>/run</b> từ Telegram sẽ tự chạy.`,
        [[{ text: '📊 Status', cb: 'status' }]],
      );
    }

  } else if (name === '/run_keep') {
    const saved = await readAutoRefillSettings();
    const keepN = (saved?.targetCount) || 1;
    if (saved?.settings) {
      fetch(`${APP_BASE}/launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...saved.settings, requestedCount: keepN }),
      }).catch(() => {});
      await send(chatId,
        `⏳ Đang khởi động <b>${keepN} luồng</b> (giữ nguyên)…`,
        [[{ text: '📊 Status', cb: 'status' }, { text: '🛑 Stop', cb: 'stop' }]],
      );
    } else {
      await appPost('/auto-refill', { enabled: true });
      const cur = await appGet('/state').catch(() => ({}));
      await send(chatId, `🟢 Đã bật — <b>${cur.targetCount} luồng</b>.`,
        [[{ text: '📊 Status', cb: 'status' }, { text: '🛑 Stop', cb: 'stop' }]],
      );
    }

  } else if (name === '/stop' || name === 'stop') {
    await appPost('/stop');
    await send(chatId, '🔴 Đã dừng tất cả.', BTN_STOPPED);

  } else if (name === '/pause' || name === 'pause') {
    await appPost('/auto-refill', { enabled: false });
    await send(chatId,
      '⏸ Đã tạm dừng mở slot mới. Session đang chạy vẫn tiếp tục.',
      [[{ text: '▶ Tiếp tục', cb: 'run' }, { text: '🛑 Stop hẳn', cb: 'stop' }, { text: '📊 Status', cb: 'status' }]],
    );

  } else if (name === '/proxy' || name === 'proxy') {
    const pq = await appGet('/proxy-queue');
    await send(chatId,
      `<b>📦 Proxy</b>\nCòn: <b>${pq.available}</b> / Dùng: ${pq.used}\nDual stream: ${pq.dualStream ? '✅' : '❌'}`,
      pq.available < 20
        ? [[{ text: '🛒 Mua thêm proxy', cb: 'buy' }, { text: '📊 Status', cb: 'status' }]]
        : [[{ text: '📊 Status', cb: 'status' }]],
    );

  } else if (name === '/email' || name === 'email') {
    const eq = await appGet('/email-queue');
    await send(chatId,
      `<b>📧 Email</b>\nCòn: <b>${eq.available}</b> / Dùng: ${eq.used}`,
      [[{ text: '📊 Status', cb: 'status' }]],
    );

  } else if (name === '/done' || name === 'done') {
    const state = await appGet('/state');
    const c = state.limitRun?.count ?? 0, m = state.limitRun?.max ?? 0;
    await send(chatId, `✅ Leads: <b>${c}</b>${m > 0 ? `/${m}` : ''}`,
      [[{ text: '⚡ Speed', cb: 'speed' }, { text: '📊 Status', cb: 'status' }]],
    );

  } else if (name === '/speed' || name === 'speed') {
    const state = await appGet('/state');
    const leads = state.limitRun?.count ?? 0;
    const elapsed = Math.max(1, Math.round((Date.now() - botStartTime) / 60000));
    const speed = Math.round(((leads - sessionLeadsAtBotStart) / elapsed) * 60);
    await send(chatId,
      `⚡ ~<b>${speed} leads/giờ</b>\n(${leads - sessionLeadsAtBotStart} leads trong ${elapsed} phút)`,
      [[{ text: '✅ Leads', cb: 'done' }, { text: '📊 Status', cb: 'status' }]],
    );

  } else if (name === '/buy' || name === 'buy') {
    const ar = await appGet('/711proxy/autorefill');
    if (!ar || ar.error) {
      await send(chatId, '⚠️ Chưa cấu hình 711proxy auto-refill.', BTN_MAIN);
      return;
    }
    const res = await appPost('/711proxy/generate', {
      count: ar.count ?? 50, region: ar.region ?? 'US',
      sessTime: ar.sessTime ?? 20, sessAuto: ar.sessAuto ?? false,
    });
    const added = res.added ?? res.proxyCount ?? '?';
    await send(chatId, `🛒 Đã mua <b>${added} proxy</b> từ 711proxy.`,
      [[{ text: '📦 Xem proxy', cb: 'proxy' }, { text: '📊 Status', cb: 'status' }]],
    );

  } else if (name === '/reset' || name === 'reset') {
    await appPost('/limit-run/reset');
    sessionLeadsAtBotStart = 0; botStartTime = Date.now();
    await send(chatId, '🔄 Reset bộ đếm leads về 0.', [[{ text: '📊 Status', cb: 'status' }]]);

  } else if (name === '/log' || name === 'log') {
    const [state, logs] = await Promise.all([
      appGet('/state'),
      appGet('/browser-logs').catch(() => ({ sessions: [] })),
    ]);
    const sessions = logs.sessions ?? [];
    const lines = sessions.slice(0, 3).map((s, i) => {
      const last = s.logs?.slice(-1)[0];
      return `${i + 1}. [${s.ip ?? '?'}] ${last?.type ?? 'n/a'}: ${String(last?.detail ?? last?.url ?? '').slice(0, 60)}`;
    });
    await send(chatId,
      `<b>📋 Log</b>\n${lines.join('\n') || 'Chưa có session.'}\n\n💬 ${state.message}`,
      [[{ text: '📊 Status', cb: 'status' }, { text: '▶ Run', cb: 'run' }, { text: '🗑 Xóa Log', cb: 'clear_log' }]],
    );

  } else if (name === '/clear-log' || name === '/clearlog' || name === 'clear_log') {
    const res = await appPost('/browser-logs/clear');
    await send(chatId,
      res.success ? '🗑 Đã xóa toàn bộ log và file HTML.' : `⚠️ Lỗi: ${res.error}`,
      [[{ text: '📋 Log', cb: 'log' }, { text: '📊 Status', cb: 'status' }]],
    );

  } else if (name === '/help' || name === '/start' || name === 'help') {
    const hasAi = !!process.env.ANTHROPIC_API_KEY;
    await send(chatId,
      `<b>🤖 AutoLeadPC Bot</b>${hasAi ? ' <i>+ AI</i>' : ''}\n\n` +
      (hasAi
        ? '💬 Chat tự nhiên — AI hiểu và thực hiện.\nHoặc dùng các lệnh:\n\n'
        : 'Các lệnh:\n\n') +
      `/status /run [n] /pause /stop\n/proxy /email /buy\n/done /speed /reset /log`,
      BTN_MAIN,
    );

  } else if (!name.startsWith('/')) {
    // Tin nhắn tự nhiên → keyword match trước, AI sau nếu có key
    const t = cmdText.toLowerCase();

    // Keyword matching tiếng Việt (không cần API key)
    const KW = [
      { pat: /\b(chạy|run|bật|start|khởi động|mở)\b.*(\d+)/, action: (m) => `/run ${m[2]}` },
      { pat: /\b(chạy|run|bật|start|mở)\b(?!.*\d)/, action: () => '/run' },
      { pat: /\b(dừng|stop|tắt|kết thúc|ngừng)\b/, action: () => '/stop' },
      { pat: /\b(tạm dừng|pause|nghỉ)\b/, action: () => '/pause' },
      { pat: /\b(proxy|proxies)\b.*\b(còn|bao nhiêu|status|xem)\b|\b(xem|bao nhiêu)\b.*\bproxy\b/, action: () => '/proxy' },
      { pat: /\b(mua|buy|nạp|thêm)\b.*\bproxy\b|\bproxy\b.*\b(mua|buy|nạp)\b/, action: () => '/buy' },
      { pat: /\b(email)\b.*\b(còn|bao nhiêu|xem)\b|\b(xem|bao nhiêu)\b.*\bemail\b/, action: () => '/email' },
      { pat: /\b(lead|leads|kết quả|hoàn thành|done)\b/, action: () => '/done' },
      { pat: /\b(tốc độ|speed|nhanh|chậm)\b/, action: () => '/speed' },
      { pat: /\b(log|nhật ký|lịch sử)\b.*\b(xem|xóa|clear)\b|\b(xóa|clear)\b.*\blog\b/, action: (m, txt) => txt.includes('xóa') || txt.includes('clear') ? '/clear-log' : '/log' },
      { pat: /\b(trạng thái|status|tình trạng|đang làm gì|thế nào)\b/, action: () => '/status' },
      { pat: /\b(reset|đặt lại)\b.*\b(lead|bộ đếm|count)\b/, action: () => '/reset' },
    ];

    let matched = null;
    for (const { pat, action } of KW) {
      const m = t.match(pat);
      if (m) { matched = action(m, t); break; }
    }

    if (matched) {
      await execCommand(chatId, userId, matched);
      return;
    }

    // Không match keyword → thử AI
    let state = null;
    try {
      const [s, pq] = await Promise.all([appGet('/state'), appGet('/proxy-queue')]);
      state = { ...s, _proxyAvail: pq.available };
    } catch {}

    const decision = await aiChat(cmdText, state);
    if (!decision) {
      await send(chatId,
        '🤔 Không hiểu yêu cầu. Chọn thao tác bên dưới hoặc gõ /help:',
        BTN_MAIN,
      );
      return;
    }

    // Thực hiện action
    const actionMap = {
      status: '/status', run: decision.params?.count ? `/run ${decision.params.count}` : '/run',
      stop: '/stop', pause: '/pause', proxy: '/proxy', email: '/email',
      buy_proxy: '/buy', done: '/done', speed: '/speed', reset: '/reset', log: '/log', clear_log: '/clear-log',
    };
    if (decision.action !== 'reply' && actionMap[decision.action]) {
      await execCommand(chatId, userId, actionMap[decision.action]);
    }

    // Gửi message của AI + gợi ý
    if (decision.message && decision.action !== 'status') {
      const suggBtns = suggestionsToButtons(decision.suggestions ?? []);
      await send(chatId, `💬 ${decision.message}`, suggBtns);
    } else if (decision.action === 'reply') {
      const suggBtns = suggestionsToButtons(decision.suggestions ?? []);
      await send(chatId, decision.message || '...', suggBtns || BTN_MAIN);
    }
  }
}

// ─── Xử lý callback (nút bấm) ────────────────────────────────────────────────

async function handleCallback(chatId, userId, callbackId, data) {
  await answerCallback(callbackId);
  // run_N → /run N
  if (data.startsWith('run_')) {
    const n = parseInt(data.slice(4), 10);
    await execCommand(chatId, userId, n > 0 ? `/run ${n}` : '/run_keep');
  } else {
    await execCommand(chatId, userId, data);
  }
}

// ─── Push notifications ───────────────────────────────────────────────────────

async function checkAndNotify() {
  if (!notifyChatId) return;
  try {
    const [state, pq] = await Promise.all([appGet('/state'), appGet('/proxy-queue')]);
    const active = state.activeCount ?? 0;
    const enabled = state.enabled && !state.stopRequested;
    const proxyAvail = pq.available ?? 0;
    const limitCount = state.limitRun?.count ?? 0;
    const limitMax = state.limitRun?.max ?? 0;

    if (proxyAvail < 10 && proxyAvail > 0 && !lowProxyNotified) {
      lowProxyNotified = true;
      await tgNotify(
        `⚠️ <b>Proxy sắp hết!</b> Còn ${proxyAvail} proxy.`,
        [[{ text: '🛒 Mua thêm ngay', cb: 'buy' }, { text: '📊 Status', cb: 'status' }]],
      );
    } else if (proxyAvail >= 15) lowProxyNotified = false;

    if (proxyAvail === 0 && enabled && lastActiveCount > 0) {
      await tgNotify(
        `🚫 <b>Hết proxy!</b> Luồng sẽ dừng khi xong session hiện tại.`,
        [[{ text: '🛒 Mua proxy', cb: 'buy' }, { text: '🛑 Stop', cb: 'stop' }]],
      );
    }

    if (enabled && active === 0) {
      if (!stuckSince) stuckSince = Date.now();
      else if (Date.now() - stuckSince > 10 * 60 * 1000) {
        await tgNotify(
          `⚠️ <b>Có thể bị stuck!</b> 0 luồng đang chạy trong 10+ phút.`,
          [[{ text: '▶ Chạy lại', cb: 'run' }, { text: '🛑 Stop', cb: 'stop' }, { text: '📊 Status', cb: 'status' }]],
        );
        stuckSince = Date.now() + 15 * 60 * 1000;
      }
    } else stuckSince = null;

    if (limitMax > 0 && limitCount >= limitMax && lastLimitRunCount < limitMax) {
      await tgNotify(
        `🎉 <b>Xong!</b> Đạt ${limitCount}/${limitMax} leads.`,
        [[{ text: '▶ Chạy tiếp', cb: 'run' }, { text: '🔄 Reset', cb: 'reset' }, { text: '📊 Status', cb: 'status' }]],
      );
    }

    if (limitMax === 0 && limitCount > 0 && limitCount % 50 === 0 && limitCount !== lastLimitRunCount) {
      const elapsed = Math.max(1, (Date.now() - botStartTime) / 60000);
      const speed = Math.round(((limitCount - sessionLeadsAtBotStart) / elapsed) * 60);
      await tgNotify(
        `✅ <b>${limitCount} leads</b> hoàn thành. ⚡ ~${speed}/giờ`,
        [[{ text: '📊 Status', cb: 'status' }, { text: '⚡ Speed', cb: 'speed' }]],
      );
    }

    lastActiveCount = active;
    lastLimitRunCount = limitCount;
  } catch {}
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

async function pollUpdates() {
  try {
    const data = await tgPost('getUpdates', { offset: lastUpdateId + 1, timeout: 25 });
    if (!data.ok || !data.result) return;
    for (const upd of data.result) {
      lastUpdateId = upd.update_id;

      if (upd.callback_query) {
        const cq = upd.callback_query;
        await handleCallback(cq.message.chat.id, cq.from.id, cq.id, cq.data);
        continue;
      }

      const msg = upd.message;
      if (!msg?.text) continue;
      await execCommand(msg.chat.id, msg.from.id, msg.text.split('@')[0]);
    }
  } catch {
    await new Promise((r) => setTimeout(r, 3000));
  }
}

// ─── Khởi động ────────────────────────────────────────────────────────────────

export async function startTelegramBot() {
  const configPath = join(homedir(), 'Library', 'Application Support', dataDirName, 'telegram-config.json');
  try {
    const raw = JSON.parse(await readFile(configPath, 'utf8'));
    if (!raw.botToken || !raw.allowedUserId) return;
    cfg = raw;
    notifyChatId = raw.notifyChatId ?? null;
    console.log('[TGBot] Đã khởi động, allowedUserId:', cfg.allowedUserId);
  } catch { return; }

  try {
    const state = await appGet('/state');
    sessionLeadsAtBotStart = state.limitRun?.count ?? 0;
    lastLimitRunCount = sessionLeadsAtBotStart;
  } catch {}

  const poll = async () => { try { await pollUpdates(); } catch {} setTimeout(poll, 1000); };
  void poll();

  setInterval(checkAndNotify, 30_000);

  if (cfg.notifyChatId) {
    notifyChatId = cfg.notifyChatId;
    const state = await appGet('/state').catch(() => null);
    const running = state?.enabled && !state?.stopRequested;
    await tgNotify(
      `🤖 <b>AutoLeadPC đã khởi động</b> lúc ${new Date().toLocaleTimeString('vi-VN')}`,
      running ? BTN_RUNNING : BTN_STOPPED,
    );
  }
}
