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

const APP_PORT = Number(process.env.AUTOLEADPC_PORT) || 3211;
const APP_BASE = `http://127.0.0.1:${APP_PORT}`;

let cfg = null;
let lastUpdateId = 0;
let notifyChatId = null;

let lastActiveCount = 0;
let lastLimitRunCount = 0;
let stuckSince = null;
let lowProxyNotified = false;
let low711BalanceNotified = false;
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

// Chuyển đổi mảng nút hỗ trợ cả callback_data, web_app và url
function formatInlineButtons(buttons) {
  if (!buttons?.length) return null;
  return buttons.map((row) =>
    row.map((b) => {
      if (b.web_app) return { text: b.text, web_app: b.web_app };
      if (b.url) return { text: b.text, url: b.url };
      return { text: b.text, callback_data: b.cb };
    })
  );
}

// Gửi tin + nút inline tùy chọn
// buttons: [[{ text, cb, web_app, url }]] — mảng hàng, mỗi hàng là mảng nút
async function send(chatId, text, buttons = null) {
  const body = { chat_id: chatId, text, parse_mode: 'HTML' };
  const formatted = formatInlineButtons(buttons);
  if (formatted?.length) {
    body.reply_markup = { inline_keyboard: formatted };
  }
  return tgPost('sendMessage', body).catch(() => {});
}

// Gửi ảnh chụp màn hình + chú thích & nút inline
async function sendPhoto(chatId, imageBuffer, caption = '', buttons = null) {
  if (!cfg?.botToken) return null;
  const formData = new FormData();
  formData.append('chat_id', String(chatId));
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
  formData.append('photo', blob, 'screenshot.jpg');
  if (caption) {
    formData.append('caption', caption);
    formData.append('parse_mode', 'HTML');
  }
  const formatted = formatInlineButtons(buttons);
  if (formatted?.length) {
    formData.append('reply_markup', JSON.stringify({ inline_keyboard: formatted }));
  }
  const r = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendPhoto`, {
    method: 'POST',
    body: formData,
  });
  return r.json().catch(() => ({}));
}

async function answerCallback(id, text = '') {
  await tgPost('answerCallbackQuery', { callback_query_id: id, text }).catch(() => {});
}

// ─── Push notification (dùng từ app.mjs) ─────────────────────────────────────

export async function tgNotify(text, buttons = null) {
  if (!cfg || !notifyChatId) return;
  await send(notifyChatId, text, buttons);
}

export async function tgNotifyPhoto(imageBuffer, caption = '', buttons = null) {
  if (!cfg || !notifyChatId) return;
  await sendPhoto(notifyChatId, imageBuffer, caption, buttons);
}

// ─── Local app API ────────────────────────────────────────────────────────────

async function appGet(path) {
  const r = await fetch(`${APP_BASE}${path}`);
  return r.json();
}

async function readAutoRefillSettings() {
  const dir = join(homedir(), 'Library', 'Application Support', dataDirName);
  // autorefill-settings.json bị xoá khi Stop; last-launch-settings.json giữ cấu hình lần Start gần nhất
  // nên /run vẫn chạy được sau Stop mà không cần mở app bấm Start lại.
  for (const name of ['autorefill-settings.json', 'last-launch-settings.json']) {
    try {
      const raw = JSON.parse(await readFile(join(dir, name), 'utf8'));
      if (raw?.settings) return raw;
    } catch { /* thử file tiếp theo */ }
  }
  return null;
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
  [{ text: '📱 Mini App', cb: 'app' }, { text: '📺 Màn hình', cb: 'screen' }],
  [{ text: '📶 Băng thông', cb: 'bw' }, { text: '🌐 DS Slot', cb: 'slots' }],
  [{ text: '⏸ Pause', cb: 'pause' }, { text: '🛑 Stop', cb: 'stop' }],
  [{ text: '📦 Proxy', cb: 'proxy' }, { text: '🛒 Mua Proxy', cb: 'buy' }],
  [{ text: '🗑 Xóa tất cả proxy', cb: 'clear_proxy' }],
];

const BTN_RUNNING = [
  [{ text: '📊 Status', cb: 'status' }, { text: '📱 Mini App', cb: 'app' }],
  [{ text: '📺 Màn hình', cb: 'screen' }, { text: '🌐 DS Slot', cb: 'slots' }],
  [{ text: '📶 Băng thông', cb: 'bw' }, { text: '⏸ Pause', cb: 'pause' }],
  [{ text: '📦 Proxy', cb: 'proxy' }, { text: '🛑 Stop', cb: 'stop' }],
];

const BTN_STOPPED = [
  [{ text: '▶ Run lại', cb: 'run' }, { text: '📊 Status', cb: 'status' }],
  [{ text: '📶 Băng thông', cb: 'bw' }, { text: '🛒 Mua Proxy', cb: 'buy' }],
  [{ text: '📦 Proxy', cb: 'proxy' }],
];

// ─── AI Agent ─────────────────────────────────────────────────────────────────

const AI_SYSTEM = `Bạn là trợ lý AI quản lý app AutoLeadPC qua Telegram — app tự động điền form leads trên Mac, dùng proxy và email queue.

Bạn có thể thực hiện các hành động sau:
- status: xem trạng thái đầy đủ
- bw: xem thống kê băng thông hôm nay, data 711Proxy còn lại và chi tiết tiêu hao theo slot
- screen: chụp ảnh màn hình slot trình duyệt đang chạy (nếu có số slot thì chỉ định slot, vd param count = 1)
- slots: xem danh sách các slot/trình duyệt đang chạy
- close_slot: tắt riêng 1 slot trình duyệt (param count = số slot)
- run [n]: bật tự bù (n = số luồng, mặc định giữ nguyên)
- stop: dừng tất cả
- pause: tạm dừng mở slot mới (không kill session đang chạy)
- proxy: xem hàng đợi proxy
- email: xem hàng đợi email
- buy_proxy: mua thêm proxy từ 711proxy
- done: xem leads hoàn thành
- speed: tốc độ leads/giờ
- reset: reset bộ đếm leads
- clear_proxy: xóa TOÀN BỘ proxy trong hàng đợi (dùng khi cần nạp danh sách proxy mới)
- log: log session gần nhất
- clear_log: xóa toàn bộ log
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
    'app': { text: '📱 Mini App', cb: 'app' },
    'mini': { text: '📱 Mini App', cb: 'app' },
    'live': { text: '📱 Mini App', cb: 'app' },
    'bw': { text: '📶 Băng thông', cb: 'bw' },
    'bandwidth': { text: '📶 Băng thông', cb: 'bw' },
    'screen': { text: '📺 Màn hình', cb: 'screen' },
    'snap': { text: '📺 Màn hình', cb: 'screen' },
    'slots': { text: '🌐 DS Slot', cb: 'slots' },
    'browsers': { text: '🌐 DS Slot', cb: 'slots' },
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
    'clear_proxy': { text: '🗑 Xóa tất cả proxy', cb: 'clear_proxy' },
    'clearproxy': { text: '🗑 Xóa tất cả proxy', cb: 'clear_proxy' },
  };
  const btns = suggestions.map((s) => MAP[s] || MAP[s.toLowerCase()]).filter(Boolean);
  if (!btns.length) return null;
  // Chia thành hàng 2 để dễ bấm trên điện thoại
  const rows = [];
  for (let i = 0; i < btns.length; i += 2) rows.push(btns.slice(i, i + 2));
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
    const toffersPoint = state.toffers?.point ?? '--';
    const toffersLeads = state.toffers?.leadCount ?? 0;
    await send(chatId,
      `<b>📊 Trạng thái</b>\n` +
      `💎 <b>Tổng Point: ${toffersPoint} pt</b> (${toffersLeads} leads)\n` +
      `▶ Luồng: ${state.activeCount}/${state.targetCount} ${running ? '🟢' : '🔴'}\n` +
      `📦 Proxy: ${pq.available} còn / ${pq.used} dùng\n` +
      `📧 Email: ${eq.available} còn / ${eq.used} dùng\n` +
      `✅ Leads máy: ${leads}${state.limitRun?.max > 0 ? '/' + state.limitRun.max : ''}\n` +
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
        : [[{ text: '📊 Status', cb: 'status' }, { text: '🗑 Xóa tất cả proxy', cb: 'clear_proxy' }]],
    );

  } else if (name === '/clearproxy' || name === '/clear_proxy' || name === 'clearproxy' || name === 'clear_proxy') {
    // Xóa toàn bộ proxy trong hàng đợi + ô nhập danh sách (giống nút trên giao diện web).
    const res = await appPost('/proxy-queue/clear').catch((e) => ({ error: e.message }));
    if (res?.error) {
      await send(chatId, `❌ Xóa proxy thất bại: ${res.error}`, [[{ text: '📦 Proxy', cb: 'proxy' }]]);
    } else {
      await send(chatId,
        `🗑 <b>Đã xóa tất cả proxy</b>\n${res?.message || 'Hàng đợi proxy đã được làm trống.'}`,
        [[{ text: '📦 Proxy', cb: 'proxy' }, { text: '📊 Status', cb: 'status' }]],
      );
    }

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

  } else if (name === '/bw' || name === '/bandwidth' || name === 'bw' || name === 'bandwidth') {
    const [state, cons] = await Promise.all([
      appGet('/state').catch(() => ({})),
      appGet('/711proxy/consumption?days=1').catch(() => ({})),
    ]);
    const bw = state.bandwidth || {};
    const today = bw.today || {};
    const p711 = bw.proxy711 || {};
    const sessions = (state.chromeSessions || []).filter((s) => !s.isClosed);

    let text = `<b>📶 Thống kê Băng thông & 711Proxy</b>\n\n`;

    // 1. Thống kê app đo hôm nay
    text += `<b>📊 Hôm nay (App đo):</b>\n`;
    text += `• Tổng tiêu hao: <b>${today.formatted || '0 B'}</b> (${today.requestCount?.toLocaleString('vi-VN') || 0} reqs)\n`;
    text += `• Tải về: ⬇️ <b>${today.receivedFormatted || '0 B'}</b> | Tải lên: ⬆️ <b>${today.sentFormatted || '0 B'}</b>\n\n`;

    // 2. Data 711Proxy từ Web API
    text += `<b>🌐 711Proxy (Web API):</b>\n`;
    if (p711.ok) {
      text += `• Gói dung lượng: <b>${p711.packageFormatted || (p711.packageGb + ' GB')}</b>\n`;
      text += `• Còn lại: <b>${p711.remainingFormatted || (p711.remainingGb + ' GB')}</b> (${p711.remainingPercent ?? 0}%)\n`;
      text += `• Đã dùng: <b>${p711.usedFormatted || (p711.usedGb + ' GB')}</b> (${p711.usedPercent ?? 0}%)\n`;
    } else {
      text += `• Số dư: <i>${p711.error || 'Chưa đồng bộ số dư'}</i>\n`;
    }

    if (cons?.ok) {
      text += `• Web ghi nhận tiêu hao hôm nay: <b>${cons.totalFormatted || '0 B'}</b> (${cons.activeHoursCount || 0} giờ chạy)\n`;
      if (cons.peakHour) {
        text += `• Giờ cao điểm: <b>${cons.peakHour}</b> (${cons.peakFormatted})\n`;
      }
    }
    text += `\n`;

    // 3. Tiêu hao theo các slot đang chạy
    if (sessions.length > 0) {
      text += `<b>🖥 Tiêu hao theo Slot đang chạy:</b>\n`;
      for (const s of sessions) {
        text += `• <b>Slot ${s.slot}</b> [<code>${s.exitIp || 'Local'}</code>]: <b>${s.bandwidthFormatted || '0 B'}</b> (${s.requestCount || 0} reqs)\n`;
      }
    } else {
      text += `<i>(Hiện không có slot nào đang chạy)</i>\n`;
    }

    const buttons = [
      [{ text: '📱 Mini App', cb: 'app' }, { text: '🔄 Làm mới', cb: 'bw' }],
      [{ text: '📺 Màn hình', cb: 'screen' }, { text: '🌐 DS Slot', cb: 'slots' }],
      [{ text: '📊 Status', cb: 'status' }],
    ];
    await send(chatId, text, buttons);

  } else if (name === '/point' || name === '/points' || name === 'point' || name === 'points') {
    const state = await appGet('/state').catch(() => ({}));
    const toffers = state.toffers || {};
    const pt = toffers.point ?? '--';
    const leads = toffers.leadCount ?? 0;
    const tunnel = await appGet('/tunnel').catch(() => null);
    const miniUrl = `${tunnel?.url || 'https://duc.taile3f032.ts.net'}/screen-mini`;
    await send(chatId,
      `💎 <b>TỔNG POINT TOFFERS: ${pt} pt</b>\n` +
      `🎯 Tổng Leads ghi nhận: <b>${leads} leads</b>\n` +
      `🕒 Cập nhật: ${toffers.updatedAt ? new Date(toffers.updatedAt).toLocaleTimeString('vi-VN') : 'vừa xong'}\n\n` +
      `Bấm nút bên dưới để mở Mini App xem danh sách chi tiết:`,
      [[{ text: '📱 Xem Chi Tiết Mini App', web_app: { url: miniUrl } }]],
    );

  } else if (name === '/app' || name === '/mini' || name === '/live' || name === 'app' || name === 'mini' || name === 'live') {
    let tunnel = await appGet('/tunnel').catch(() => null);
    if (!tunnel?.url) {
      await send(chatId, '⏳ Đang khởi tạo kết nối Cloudflare Tunnel HTTPS cho Telegram Mini App...');
      tunnel = await appPost('/tunnel/start').catch(() => null);
    }

    if (tunnel?.url) {
      const miniUrl = `${tunnel.url}/screen-mini`;
      void tgPost('setChatMenuButton', { chat_id: chatId, menu_button: { type: 'web_app', text: '📺 Màn hình', web_app: { url: miniUrl } } }).catch(() => {});
      await send(chatId,
        `📱 <b>AutoLeadPC - Điều Khiển Trực Tiếp</b>\n\n` +
        `Nhấn nút bên dưới để mở giao diện Mini App ngay trong Telegram:\n` +
        `• <b>Chạm màn hình</b> để click chuột thực tế.\n` +
        `• <b>Vuốt lên / xuống</b> để cuộn trang.\n` +
        `• <b>Gõ bàn phím</b> để điền chữ vào Chrome.\n` +
        `• Xem Live Stream thời gian thực (60fps) của từng slot.\n\n` +
        `🔗 <i>Link web:</i> <a href="${miniUrl}">${miniUrl}</a>`,
        [
          [{ text: '📺 Mở Trực Tiếp Chrome (Live)', web_app: { url: miniUrl } }],
          [{ text: '📊 Status', cb: 'status' }, { text: '🌐 DS Slot', cb: 'slots' }],
        ],
      );
    } else {
      await send(chatId,
        `⚠️ Chưa thể tạo đường truyền HTTPS tự động (${tunnel?.error || 'timeout'}).\nBạn có thể dùng lệnh /screen để xem ảnh chụp màn hình Chrome.`,
        [[{ text: '📺 Chụp ảnh /screen', cb: 'screen' }, { text: '📊 Status', cb: 'status' }]],
      );
    }

  } else if (name === '/screen' || name === '/snap' || name === 'screen' || name === 'snap') {
    const state = await appGet('/state').catch(() => ({}));
    const sessions = (state.chromeSessions || []).filter((s) => !s.isClosed);

    if (!sessions.length) {
      await send(chatId,
        '⚠️ <b>Hiện không có slot nào đang chạy</b> để chụp màn hình.\nNhấn ▶ <b>Run</b> để khởi động slot.',
        [[{ text: '▶ Run', cb: 'run' }, { text: '📊 Status', cb: 'status' }]],
      );
      return;
    }

    let targetSlot = parseInt(cmd[1], 10);
    if (!targetSlot) {
      if (sessions.length === 1) {
        targetSlot = sessions[0].slot;
      } else {
        const rows = [];
        const slotButtons = sessions.map((s) => ({
          text: `📺 Slot ${s.slot} (${s.exitIp || 'Local'})`,
          cb: `screen_${s.slot}`,
        }));
        for (let i = 0; i < slotButtons.length; i += 2) {
          rows.push(slotButtons.slice(i, i + 2));
        }
        rows.push([{ text: '📊 Status', cb: 'status' }, { text: '📶 Băng thông', cb: 'bw' }]);
        await send(chatId, `📺 <b>Chọn slot muốn chụp màn hình:</b>`, rows);
        return;
      }
    }

    const session = sessions.find((s) => s.slot === targetSlot);
    if (!session) {
      const liveList = sessions.map((s) => s.slot).join(', ');
      await send(chatId,
        `❌ Không tìm thấy <b>Slot ${targetSlot}</b> đang chạy.\nCác slot hiện tại: <b>${liveList}</b>`,
        [[{ text: '📺 Chọn Slot khác', cb: 'screen' }, { text: '📊 Status', cb: 'status' }]],
      );
      return;
    }

    try {
      const snapRes = await fetch(`${APP_BASE}/screen/snapshot/${targetSlot}`);
      if (!snapRes.ok) throw new Error(`HTTP ${snapRes.status}`);
      const arrayBuf = await snapRes.arrayBuffer();
      const imgBuffer = Buffer.from(arrayBuf);

      const urlDisplay = (session.websiteUrl || session.tabs?.[0]?.url || 'Chưa mở URL').slice(0, 70);
      const caption =
        `📺 <b>Màn hình Slot ${targetSlot}</b> (${session.deviceVersion || session.deviceProfile || 'Chrome'})\n` +
        `🌐 IP: <code>${session.exitIp || 'Local'}</code>\n` +
        `🔗 URL: <i>${urlDisplay}</i>\n` +
        `⚡ Trạng thái: ${session.action || 'Running'}\n` +
        `📶 Tiêu hao: <b>${session.bandwidthFormatted || '0 B'}</b> (${session.requestCount || 0} reqs)\n` +
        `📄 Trang: ${session.currentScreen ?? 1} | Điền: ${session.autofillFields || 0} ô`;

      const tunnel = await appGet('/tunnel').catch(() => null);
      const screenButtons = [];
      if (tunnel?.url) {
        screenButtons.push([
          { text: `📱 Xem Live Slot ${targetSlot} (Chạm & Gõ)`, web_app: { url: `${tunnel.url}/screen-mini` } },
        ]);
      }
      screenButtons.push([
        { text: `🔄 Chụp lại Slot ${targetSlot}`, cb: `screen_${targetSlot}` },
        { text: `🛑 Tắt Slot ${targetSlot}`, cb: `close_slot_${targetSlot}` },
      ]);

      const otherSlots = sessions.filter((s) => s.slot !== targetSlot);
      if (otherSlots.length > 0) {
        const otherBtns = otherSlots.slice(0, 3).map((s) => ({
          text: `📺 Slot ${s.slot}`,
          cb: `screen_${s.slot}`,
        }));
        screenButtons.push(otherBtns);
      }
      screenButtons.push([
        { text: '📶 Băng thông', cb: 'bw' },
        { text: '🌐 DS Slot', cb: 'slots' },
        { text: '📊 Status', cb: 'status' },
      ]);

      await sendPhoto(chatId, imgBuffer, caption, screenButtons);
    } catch (snapErr) {
      await send(chatId,
        `⚠️ Không thể chụp ảnh màn hình Slot ${targetSlot}: ${snapErr.message || 'Lỗi kết nối'}\n(Trình duyệt có thể đang bận chuyển trang hoặc vừa đóng).`,
        [[{ text: '🔄 Thử lại', cb: `screen_${targetSlot}` }, { text: '🌐 DS Slot', cb: 'slots' }]],
      );
    }

  } else if (name === '/slots' || name === '/browsers' || name === 'slots' || name === 'browsers') {
    const state = await appGet('/state').catch(() => ({}));
    const sessions = (state.chromeSessions || []).filter((s) => !s.isClosed);

    if (!sessions.length) {
      await send(chatId,
        '🌐 <b>Danh sách Slot</b>: Hiện không có trình duyệt nào đang chạy.',
        [[{ text: '▶ Run', cb: 'run' }, { text: '📊 Status', cb: 'status' }]],
      );
      return;
    }

    let text = `🌐 <b>Danh sách Trình duyệt đang chạy (${sessions.length}/${state.targetCount || sessions.length}):</b>\n\n`;
    for (const s of sessions) {
      const urlText = (s.websiteUrl || s.tabs?.[0]?.url || 'N/A').slice(0, 50);
      text += `• <b>Slot ${s.slot}</b> [<code>${s.exitIp || 'Local'}</code>] (${s.deviceVersion || s.deviceProfile || 'Chrome'})\n`;
      text += `  ├ 🔗 <i>${urlText}</i>\n`;
      text += `  ├ 📶 Băng thông: <b>${s.bandwidthFormatted || '0 B'}</b> (${s.requestCount || 0} reqs)\n`;
      text += `  └ ⚡ ${s.action || 'Running'} (Trang ${s.currentScreen ?? 1})\n\n`;
    }

    const rows = [];
    const snapBtns = sessions.map((s) => ({ text: `📺 Chụp S${s.slot}`, cb: `screen_${s.slot}` }));
    for (let i = 0; i < snapBtns.length; i += 3) rows.push(snapBtns.slice(i, i + 3));

    const killBtns = sessions.map((s) => ({ text: `🛑 Tắt S${s.slot}`, cb: `close_slot_${s.slot}` }));
    for (let i = 0; i < killBtns.length; i += 3) rows.push(killBtns.slice(i, i + 3));

    rows.push([
      { text: '📶 Băng thông', cb: 'bw' },
      { text: '📊 Status', cb: 'status' },
      { text: '🛑 Dừng tất cả', cb: 'stop' },
    ]);

    await send(chatId, text, rows);

  } else if (name === '/close' || name === '/kill' || name === 'close' || name === 'kill') {
    const slot = parseInt(cmd[1], 10);
    if (!slot) {
      const state = await appGet('/state').catch(() => ({}));
      const sessions = (state.chromeSessions || []).filter((s) => !s.isClosed);
      if (!sessions.length) {
        await send(chatId, '⚠️ Hiện không có slot nào đang chạy để tắt.', BTN_MAIN);
        return;
      }
      const rows = [];
      const killBtns = sessions.map((s) => ({ text: `🛑 Tắt Slot ${s.slot}`, cb: `close_slot_${s.slot}` }));
      for (let i = 0; i < killBtns.length; i += 2) rows.push(killBtns.slice(i, i + 2));
      rows.push([{ text: '🌐 DS Slot', cb: 'slots' }, { text: '📊 Status', cb: 'status' }]);
      await send(chatId, '🛑 <b>Chọn slot muốn tắt:</b>', rows);
      return;
    }

    const res = await appPost(`/browser/close/${slot}`).catch((e) => ({ error: e.message }));
    if (res?.ok) {
      await send(chatId,
        `🛑 Đã tắt riêng <b>Slot ${slot}</b> thành công (không tự bù slot mới).`,
        [[{ text: '🌐 DS Slot', cb: 'slots' }, { text: '📊 Status', cb: 'status' }]],
      );
    } else {
      await send(chatId,
        `❌ Tắt Slot ${slot} thất bại: ${res?.error || 'Không tìm thấy slot'}`,
        [[{ text: '🌐 DS Slot', cb: 'slots' }, { text: '📊 Status', cb: 'status' }]],
      );
    }

  } else if (name === '/help' || name === '/start' || name === 'help') {
    void registerBotCommands();
    const hasAi = !!process.env.ANTHROPIC_API_KEY;
    await send(chatId,
      `<b>🤖 AutoLeadPC Bot</b>${hasAi ? ' <i>+ AI</i>' : ''}\n\n` +
      (hasAi
        ? '💬 Chat tự nhiên — AI hiểu và thực hiện.\nHoặc dùng các lệnh quản lý:\n\n'
        : 'Các lệnh quản lý:\n\n') +
      `<b>Điều khiển:</b>\n` +
      `/status — Trạng thái tổng thể\n` +
      `/run [n] — Bật tự bù n luồng\n` +
      `/pause — Tạm dừng mở slot mới\n` +
      `/stop — Dừng toàn bộ luồng\n\n` +
      `<b>Giám sát & Slot:</b>\n` +
      `/bw — Băng thông hôm nay & số dư 711Proxy\n` +
      `/screen [slot] — Chụp màn hình trực tiếp slot\n` +
      `/slots — Danh sách các slot đang chạy\n` +
      `/close [slot] — Tắt riêng 1 slot (không bù lại)\n\n` +
      `<b>Proxy & Email:</b>\n` +
      `/proxy — Hàng đợi proxy\n` +
      `/buy — Mua proxy từ 711proxy\n` +
      `/clearproxy — Xóa tất cả proxy trong hàng đợi\n` +
      `/email — Hàng đợi email\n\n` +
      `<b>Thống kê:</b>\n` +
      `/done /speed /reset /log /clear-log`,
      BTN_MAIN,
    );

  } else if (name === '/menu' || name === 'menu') {
    void registerBotCommands();
    await send(chatId,
      '📋 <b>Menu lệnh điều khiển:</b>\nBạn có thể gõ <code>/</code> trên bàn phím hoặc nhấn nút <b>Menu</b> ở góc dưới bên trái để chọn nhanh các lệnh.',
      BTN_MAIN,
    );

  } else if (!name.startsWith('/')) {
    // Tin nhắn tự nhiên → keyword match trước, AI sau nếu có key
    const t = cmdText.toLowerCase();

    // Keyword matching tiếng Việt (không cần API key)
    const KW = [
      { pat: /\b(app|mini|mini app|live|trực tiếp|live stream|điều khiển)\b/, action: () => '/app' },
      { pat: /\b(chạy|run|bật|start|khởi động|mở)\b.*(\d+)/, action: (m) => `/run ${m[2]}` },
      { pat: /\b(chạy|run|bật|start|mở)\b(?!.*\d)(?!.*(màn hình|screen|slot|proxy|log))/, action: () => '/run' },
      { pat: /\b(băng thông|dung lượng|tiêu hao|data|bw|bandwidth)\b/, action: () => '/bw' },
      { pat: /\b(chụp|screen|màn hình|snapshot|snap)\b.*(\d+)/, action: (m) => `/screen ${m[2]}` },
      { pat: /\b(chụp|screen|màn hình|snapshot|snap)\b/, action: () => '/screen' },
      { pat: /\b(tắt|đóng|kill|close)\b.*(slot|luồng|trình duyệt|browser)\s*(\d+)/, action: (m) => `/close ${m[3]}` },
      { pat: /\b(slot|luồng|trình duyệt|browser)\s*(\d+).*(tắt|đóng|kill|close)/, action: (m) => `/close ${m[2]}` },
      { pat: /\b(danh sách|ds|xem|kiểm tra)\b.*(slot|luồng|trình duyệt|browser)\b|\b(slot|luồng|trình duyệt|browser)\b.*(đang chạy|hoạt động)/, action: () => '/slots' },
      { pat: /\b(dừng|stop|tắt|kết thúc|ngừng)\b(?!.*(slot|luồng|trình duyệt))/, action: () => '/stop' },
      { pat: /\b(tạm dừng|pause|nghỉ)\b/, action: () => '/pause' },
      { pat: /\b(xóa|xoá|clear)\b.*\b(proxy|proxies)\b|\b(proxy|proxies)\b.*\b(xóa|xoá|clear)\b/, action: () => '/clearproxy' },
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
      status: '/status',
      app: '/app',
      mini: '/app',
      live: '/app',
      bw: '/bw',
      bandwidth: '/bw',
      screen: decision.params?.count ? `/screen ${decision.params.count}` : '/screen',
      slots: '/slots',
      close_slot: decision.params?.count ? `/close ${decision.params.count}` : '/close',
      run: decision.params?.count ? `/run ${decision.params.count}` : '/run',
      stop: '/stop',
      pause: '/pause',
      proxy: '/proxy',
      email: '/email',
      buy_proxy: '/buy',
      done: '/done',
      speed: '/speed',
      reset: '/reset',
      log: '/log',
      clear_log: '/clear-log',
      clear_proxy: '/clearproxy',
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
  } else if (data.startsWith('screen_')) {
    const slot = parseInt(data.slice(7), 10);
    await execCommand(chatId, userId, slot ? `/screen ${slot}` : '/screen');
  } else if (data.startsWith('close_slot_')) {
    const slot = parseInt(data.slice(11), 10);
    await execCommand(chatId, userId, slot ? `/close ${slot}` : '/close');
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

    // Cảnh báo số dư dung lượng 711Proxy thấp (< 1.0 GB)
    const p711 = state.bandwidth?.proxy711;
    if (p711?.ok && typeof p711.remainingGb === 'number') {
      if (p711.remainingGb <= 1.0 && !low711BalanceNotified) {
        low711BalanceNotified = true;
        await tgNotify(
          `⚠️ <b>Cảnh báo Dung lượng 711Proxy!</b>\n` +
          `Dung lượng còn lại: <b>${p711.remainingFormatted || (p711.remainingGb.toFixed(2) + ' GB')}</b> (${p711.remainingPercent ?? 0}%)\n` +
          `Vui lòng nạp thêm data để tránh gián đoạn tiến trình.`,
          [[{ text: '📶 Băng thông', cb: 'bw' }, { text: '📊 Status', cb: 'status' }]],
        );
      } else if (p711.remainingGb > 2.0) {
        low711BalanceNotified = false;
      }
    }

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

/**
 * Thế hệ (generation) của bot đang chạy. Mỗi lần reload/stop tăng lên 1 để vòng
 * poll cũ tự thoát, tránh 2 vòng poll cùng gọi Telegram API gây trùng lệnh.
 *
 * @type {number}
 */
let botGeneration = 0;

/**
 * Timer kiểm tra/thông báo định kỳ (checkAndNotify mỗi 30s), cần clear khi reload.
 *
 * @type {ReturnType<typeof setInterval>|null}
 */
let notifyTimer = null;

/**
 * Dừng bot Telegram hiện tại (nếu đang chạy): tăng generation để vòng poll cũ
 * thoát và clear timer thông báo.
 *
 * @return {void}
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-05
 */
export function stopTelegramBot() {
  botGeneration += 1;
  if (notifyTimer) {
    clearInterval(notifyTimer);
    notifyTimer = null;
  }
  cfg = null;
}

/**
 * Đọc lại telegram-config.json và khởi động bot với cấu hình mới.
 * Dùng khi người dùng lưu Bot Token / Chat ID từ giao diện web.
 *
 * @return {Promise<{running: boolean, error?: string}>} Trạng thái sau khi reload.
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-11-05
 */
export async function reloadTelegramBot() {
  stopTelegramBot();
  lastUpdateId = 0;
  const started = await startTelegramBot();
  return { running: Boolean(started) };
}

// ─── Danh sách lệnh gợi ý hiển thị khi gõ "/" trên Telegram ──────────────────

export const BOT_COMMANDS = [
  { command: 'app', description: '📱 Mở Mini App xem Live Chrome & điều khiển (chạm/gõ)' },
  { command: 'status', description: '📊 Xem trạng thái hoạt động & luồng' },
  { command: 'point', description: '💎 Xem tổng Point và số Leads Toffers' },
  { command: 'bw', description: '📶 Băng thông hôm nay & số dư 711Proxy' },
  { command: 'screen', description: '📺 Chụp ảnh màn hình live của slot' },
  { command: 'slots', description: '🌐 Danh sách các slot đang chạy' },
  { command: 'close', description: '🛑 Tắt riêng 1 slot (không tự bù)' },
  { command: 'run', description: '▶ Khởi động luồng (chọn số luồng)' },
  { command: 'pause', description: '⏸ Tạm dừng mở slot mới' },
  { command: 'stop', description: '🛑 Dừng toàn bộ hệ thống' },
  { command: 'proxy', description: '📦 Xem hàng đợi proxy' },
  { command: 'buy', description: '🛒 Mua proxy từ 711Proxy' },
  { command: 'clearproxy', description: '🗑 Xóa tất cả proxy trong hàng đợi' },
  { command: 'email', description: '📧 Xem hàng đợi email' },
  { command: 'done', description: '✅ Xem số leads hoàn thành' },
  { command: 'speed', description: '⚡ Xem tốc độ leads/giờ' },
  { command: 'log', description: '📋 Xem nhật ký session gần nhất' },
  { command: 'clearlog', description: '🗑 Xóa toàn bộ log' },
  { command: 'reset', description: '🔄 Đặt lại bộ đếm leads về 0' },
  { command: 'help', description: 'ℹ️ Hướng dẫn sử dụng chi tiết' },
];

/**
 * Đăng ký danh sách commands và nút Menu với Telegram API
 * Giúp người dùng khi gõ "/" sẽ tự động hiện danh sách gợi ý kèm mô tả tiếng Việt.
 */
export async function registerBotCommands(maxRetries = 3) {
  if (!cfg?.botToken) return false;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let tunnel = await appGet('/tunnel').catch(() => null);
      if (!tunnel?.url) {
        tunnel = await appPost('/tunnel/start').catch(() => null);
      }

      const menuButton = tunnel?.url
        ? { type: 'web_app', text: '📺 Màn hình', web_app: { url: `${tunnel.url}/screen-mini` } }
        : { type: 'commands' };

      const promises = [
        tgPost('setMyCommands', { commands: BOT_COMMANDS }),
        tgPost('setChatMenuButton', { menu_button: menuButton }),
      ];
      if (cfg.allowedUserId) {
        promises.push(tgPost('setChatMenuButton', { chat_id: cfg.allowedUserId, menu_button: menuButton }));
      }
      if (cfg.notifyChatId && cfg.notifyChatId !== cfg.allowedUserId) {
        promises.push(tgPost('setChatMenuButton', { chat_id: cfg.notifyChatId, menu_button: menuButton }));
      }

      const results = await Promise.all(promises);
      const cmdRes = results[0];
      const btnRes = results[1];
      if (cmdRes?.ok) {
        console.log('[TGBot] Đã đăng ký gợi ý lệnh Telegram (setMyCommands) thành công');
      }
      if (btnRes?.ok && tunnel?.url) {
        console.log('[TGBot] Đã kích hoạt Menu WebApp:', `${tunnel.url}/screen-mini`);
      }
      if (cmdRes?.ok) return true;
    } catch (err) {
      if (attempt === maxRetries) {
        console.warn('[TGBot] Lỗi gọi setMyCommands:', err.message);
        return false;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return false;
}

/**
 * Khởi động bot Telegram: đọc config, chạy vòng poll update và timer thông báo.
 *
 * @return {Promise<boolean>} true nếu bot đã khởi động (có botToken + allowedUserId).
 * @author coder-nguoi-tay <101690746+coder-nguoi-tay@users.noreply.github.com>
 * @since 2026-10-20
 */
export async function startTelegramBot() {
  const configPath = join(homedir(), 'Library', 'Application Support', dataDirName, 'telegram-config.json');
  try {
    const raw = JSON.parse(await readFile(configPath, 'utf8'));
    if (!raw.botToken || !raw.allowedUserId) return false;
    cfg = raw;
    notifyChatId = raw.notifyChatId ?? null;
    console.log('[TGBot] Đã khởi động, allowedUserId:', cfg.allowedUserId);
  } catch { return false; }

  // Đăng ký menu gợi ý lệnh khi gõ "/"
  void registerBotCommands();

  const generation = ++botGeneration;

  try {
    const state = await appGet('/state');
    sessionLeadsAtBotStart = state.limitRun?.count ?? 0;
    lastLimitRunCount = sessionLeadsAtBotStart;
  } catch {}

  const poll = async () => {
    if (generation !== botGeneration) return;
    try { await pollUpdates(); } catch {}
    if (generation !== botGeneration) return;
    setTimeout(poll, 1000);
  };
  void poll();

  notifyTimer = setInterval(() => {
    if (generation !== botGeneration) return;
    void checkAndNotify();
  }, 30_000);

  if (cfg.notifyChatId) {
    notifyChatId = cfg.notifyChatId;
    const state = await appGet('/state').catch(() => null);
    const running = state?.enabled && !state?.stopRequested;
    await tgNotify(
      `🤖 <b>AutoLeadPC đã khởi động</b> lúc ${new Date().toLocaleTimeString('vi-VN')}`,
      running ? BTN_RUNNING : BTN_STOPPED,
    );
  }
  return true;
}
